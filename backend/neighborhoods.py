"""Deterministic bounded neighbors; placeholder starts encode order, not validity."""
from copy import deepcopy
from datetime import timedelta


def search_domains(data, incumbents, limit):
    result, seen = [], set()

    def append(name, schedule, valid):
        signature = tuple((a["job_id"],a["machine_id"]) for a in sorted(schedule,key=lambda a:(a["machine_id"],a["start"],a["job_id"])))
        if signature in seen:
            return False
        seen.add(signature);result.append((name,{"schedule":deepcopy(schedule)},valid));return True

    for name, plan in incumbents:
        append(name,plan["schedule"],True)
    baseline_count=len(result)
    if not limit:
        return result
    jobs={j.id:j for j in data.jobs}

    def emit(name, orders):
        if len(result)-baseline_count>=limit:
            return
        schedule=[{"job_id":job,"machine_id":mid,"start":(data.horizon.start+timedelta(minutes=i)).isoformat()} for mid,order in sorted(orders.items()) for i,job in enumerate(order)]
        append(name,schedule,False)

    # Adjacent swaps are tried before single-job machine relocations/insertion.
    for name,plan in incumbents:
        orders={m.id:[a["job_id"] for a in sorted(plan["schedule"],key=lambda a:(a["start"],a["job_id"])) if a["machine_id"]==m.id] for m in data.machines}
        for mid,order in sorted(orders.items()):
            for i in range(len(order)-1):
                candidate=deepcopy(orders);candidate[mid][i],candidate[mid][i+1]=candidate[mid][i+1],candidate[mid][i]
                emit(f"SWAP_{name}_{mid}_{i}",candidate)
        for source,order in sorted(orders.items()):
            for job in order:
                for target in sorted(jobs[job].eligible):
                    if target==source:
                        continue
                    for position in range(len(orders[target])+1):
                        candidate=deepcopy(orders);candidate[source].remove(job);candidate[target].insert(position,job)
                        emit(f"MOVE_{name}_{job}_{target}_{position}",candidate)
    return result
