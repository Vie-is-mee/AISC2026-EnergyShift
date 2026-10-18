# Legacy-only assembly. Never overwrite the live API frontend.
from pathlib import Path
ROOT = Path(__file__).resolve().parent
with open(ROOT / 'scenarios_extracted.js', 'r', encoding='utf-8') as f:
    scenarios_code = f.read()

with open(ROOT / 'app_logic_part.js', 'r', encoding='utf-8') as f:
    app_logic = f.read()

full_app_code = scenarios_code + '\n' + app_logic

(ROOT / 'legacy').mkdir(exist_ok=True)
with open(ROOT / 'legacy' / 'app.js', 'w', encoding='utf-8') as f:
    f.write(full_app_code)

print('legacy/app.js written; live app.js unchanged. Size:', len(full_app_code))
