# build_app.py: Assemble scenarios and new app logic cleanly
with open('scenarios_extracted.js', 'r', encoding='utf-8') as f:
    scenarios_code = f.read()

with open('app_logic_part.js', 'r', encoding='utf-8') as f:
    app_logic = f.read()

full_app_code = scenarios_code + '\n' + app_logic

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(full_app_code)

print('app.js written successfully, size:', len(full_app_code))
