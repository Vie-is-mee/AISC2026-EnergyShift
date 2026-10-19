"""Single-process bounded demo queue with capability-isolated SQLite history.

Capability tokens are demo workspace credentials, not enterprise user identity.
"""
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext, contextmanager
import hashlib
import json
from pathlib import Path
import re
import secrets
import sqlite3
from threading import RLock
from time import time

from .analysis import analyze
from .validation import validate_input


class TeamError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


class TeamService:
    def __init__(self, path, *, analyzer=analyze, analysis_lock=None, capacity=4, per_workspace=2):
        self.path=str(path);Path(self.path).parent.mkdir(parents=True,exist_ok=True)
        self.analyzer=analyzer;self.analysis_lock=analysis_lock;self.capacity=capacity;self.per_workspace=per_workspace
        self.mutex=RLock();self.executor=ThreadPoolExecutor(max_workers=1,thread_name_prefix="energyshift-demo")
        self.futures={}
        with self.db() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS workspaces(owner TEXT PRIMARY KEY, created REAL NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES workspaces(owner) ON DELETE CASCADE, state TEXT NOT NULL, created REAL NOT NULL, report TEXT, error TEXT)")
            # Queued inputs live in memory. Restart cannot silently replay an old plan.
            db.execute("UPDATE jobs SET state='INTERRUPTED',error='Server restarted; submit again' WHERE state IN ('QUEUED','RUNNING')")

    @contextmanager
    def db(self):
        db=sqlite3.connect(self.path,timeout=10);db.row_factory=sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:yield db
        finally:
            db.close()

    def _owner(self, token):
        if not isinstance(token,str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}",token):
            raise TeamError(401,"Create a demo workspace or reopen this browser session")
        owner=hashlib.sha256(token.encode()).hexdigest()
        with self.db() as db:
            row=db.execute("SELECT created FROM workspaces WHERE owner=?",(owner,)).fetchone()
        if row is None or row["created"] < time()-7*86400:
            raise TeamError(401,"Workspace expired or was removed")
        return owner

    def create_workspace(self):
        token=secrets.token_urlsafe(32);owner=hashlib.sha256(token.encode()).hexdigest()
        with self.mutex,self.db() as db:
            db.execute("DELETE FROM workspaces WHERE created<?",(time()-7*86400,))
            if db.execute("SELECT count(*) FROM workspaces").fetchone()[0]>=128:
                raise TeamError(429,"Demo workspace limit reached")
            db.execute("INSERT INTO workspaces VALUES(?,?)",(owner,time()))
        return {"workspace_token":token,"retention_days":7,"history_limit":10,
                "note":"Private capability for this browser session; no verified user identity. Free-host disk may be ephemeral."}

    def submit(self, token, snapshot, preparation=None):
        owner=self._owner(token);gate=validate_input(snapshot)
        if gate.status!="READY":raise TeamError(422,"Invalid planning snapshot")
        from datetime import datetime,timedelta
        horizon=gate.snapshot["horizon"]
        if len(gate.snapshot["jobs"])>8 or len(gate.snapshot["machines"])>3 or datetime.fromisoformat(horizon["end"])-datetime.fromisoformat(horizon["start"])>timedelta(hours=48):
            raise TeamError(422,"Demo limit is 8 jobs, 3 machines and 48 hours")
        if preparation is not None and (not isinstance(preparation,dict) or preparation.get("input_hash")!=gate.input_hash):
            raise TeamError(422,"Input preparation hash does not match snapshot")
        job_id=secrets.token_hex(16)
        with self.mutex,self.db() as db:
            self._owner(token)  # Workspace may have been deleted during input validation.
            db.execute("BEGIN IMMEDIATE")
            active=db.execute("SELECT id,owner FROM jobs WHERE state IN ('QUEUED','RUNNING')").fetchall()
            # Removing a workspace does not stop its running thread: count it too.
            active_ids={r["id"] for r in active}|{key for key,future in self.futures.items() if not future.done()}
            if len(active_ids)>=self.capacity or sum(r["owner"]==owner for r in active)>=self.per_workspace:
                raise TeamError(429,"Demo queue full; retry after an active job finishes")
            db.execute("INSERT INTO jobs(id,owner,state,created) VALUES(?,?,'QUEUED',?)",(job_id,owner,time()))
        with self.mutex:
            self.futures[job_id]=self.executor.submit(self._run,job_id,owner,gate.snapshot,preparation)
        return {"job_id":job_id,"status":"QUEUED"}

    def _run(self, job_id, owner, snapshot, preparation):
        try:
            with self.mutex,self.db() as db:
                row=db.execute("SELECT state FROM jobs WHERE id=?",(job_id,)).fetchone()
                if row is None or row["state"]!="QUEUED":return
                db.execute("UPDATE jobs SET state='RUNNING' WHERE id=?",(job_id,))
            with self.analysis_lock if self.analysis_lock is not None else nullcontext():
                report=self.analyzer(snapshot,max_candidates=2000,enable_b2=True,b2_neighborhood_limit=12)
            report["input_snapshot"]=snapshot
            report["input_preparation"]=preparation
            encoded=json.dumps(report,allow_nan=False)
            if len(encoded.encode()) > 1024*1024:
                raise ValueError("Demo report exceeds 1 MiB storage limit")
            with self.db() as db:
                db.execute("UPDATE jobs SET state='COMPLETED',report=? WHERE id=? AND owner=?",(encoded,job_id,owner))
        except Exception:
            with self.db() as db:
                db.execute("UPDATE jobs SET state='ERROR',error='Analysis failed; no recommendation produced' WHERE id=?",(job_id,))
        finally:
            with self.mutex,self.db() as db:
                self.futures.pop(job_id,None)
                db.execute("DELETE FROM jobs WHERE owner=? AND state NOT IN ('QUEUED','RUNNING') AND id NOT IN (SELECT id FROM jobs WHERE owner=? ORDER BY created DESC LIMIT 10)",(owner,owner))
                db.execute("DELETE FROM jobs WHERE state NOT IN ('QUEUED','RUNNING') AND id NOT IN (SELECT id FROM jobs ORDER BY created DESC LIMIT 50)")

    def get(self, token, job_id):
        owner=self._owner(token)
        with self.db() as db:row=db.execute("SELECT * FROM jobs WHERE id=? AND owner=?",(job_id,owner)).fetchone()
        if row is None:raise TeamError(404,"Job not found in this workspace")
        result={"job_id":row["id"],"status":row["state"],"created":row["created"]}
        if row["report"] is not None:result["report"]=json.loads(row["report"])
        if row["error"] is not None:result["error"]=row["error"]
        return result

    def history(self, token):
        owner=self._owner(token)
        with self.db() as db:rows=db.execute("SELECT id,state,created FROM jobs WHERE owner=? ORDER BY created DESC LIMIT 10",(owner,)).fetchall()
        return {"jobs":[{"job_id":r["id"],"status":r["state"],"created":r["created"]} for r in rows]}

    def cancel(self, token, job_id):
        owner=self._owner(token)
        with self.mutex:
            current=self.get(token,job_id)
            future=self.futures.get(job_id)
            if current["status"]!="QUEUED" or future is None or not future.cancel():
                raise TeamError(409,"Only a queued job can be canceled; running work is retained in history")
            with self.db() as db:db.execute("UPDATE jobs SET state='CANCELLED' WHERE id=? AND owner=?",(job_id,owner))
            self.futures.pop(job_id,None)
        return {"job_id":job_id,"status":"CANCELLED"}

    def delete_workspace(self, token):
        owner=self._owner(token)
        with self.mutex:
            with self.db() as db:
                for row in db.execute("SELECT id FROM jobs WHERE owner=? AND state='QUEUED'",(owner,)):
                    future=self.futures.get(row["id"])
                    if future is not None and future.cancel():self.futures.pop(row["id"],None)
                db.execute("DELETE FROM workspaces WHERE owner=?",(owner,))
        return {"status":"REMOVED","note":"Running computation may finish, but its report will not be retained"}

    def close(self):
        self.executor.shutdown(wait=True,cancel_futures=True)
