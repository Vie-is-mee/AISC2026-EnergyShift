"""Read free quota and optionally make one minimal Gemma probe. Prints no credentials."""
import argparse
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
for line in (ROOT / ".env").read_text(encoding="utf-8-sig").splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        key, value = line.split("=", 1)
        if key.strip() in ("OPENROUTER_API_KEY", "OPENROUTER_MODEL"):
            os.environ[key.strip()] = value.strip().strip("\"'")

from backend.openrouter import account_free_limits, chat_json, load_config

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--probe", action="store_true", help="Make exactly one tiny free Gemma completion request")
args = parser.parse_args()
report = {"account": account_free_limits()}
if args.probe:
    response = chat_json([{"role":"user","content":"Return JSON: {\"ok\":true}"}],
                         config={**load_config(),"OPENROUTER_MODEL":"google/gemma-4-26b-a4b-it:free"}, max_completion_tokens=30)
    report["probe"] = {k:v for k,v in response.items() if k not in ("answer", "usage", "response_id")}
    report["cause"] = "GOOGLE_SHARED_FREE_POOL" if response.get("limit_source") == "upstream_provider_shared_pool" else "SEE_PROBE_STATUS"
out = ROOT / "work/demo-evidence/openrouter-safe-diagnosis.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=True))
