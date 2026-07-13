from pathlib import Path

path = Path(__file__).with_name('apply-physical-boundary-fixes.py')
content = path.read_text(encoding='utf-8')
old = '    start_old = """    const entry = await invoke('
new = '    start_old = r"""    const entry = await invoke('
if old not in content:
    raise SystemExit('Trusted entry anchor declaration was not found')
path.write_text(content.replace(old, new, 1), encoding='utf-8')
Path(__file__).unlink()
