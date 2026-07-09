from pathlib import Path

exec(compile(Path('build/scripts/codex_apply_and_cleanup.py').read_text(), 'codex_apply_and_cleanup.py', 'exec'))
