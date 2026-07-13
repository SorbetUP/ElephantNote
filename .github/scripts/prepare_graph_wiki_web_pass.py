from pathlib import Path

path = Path('.github/scripts/apply_graph_wiki_web_pass.py')
source = path.read_text()
old = """    if old in read(wikis):
        replace_once(wikis, old, old.replace('source_paths.len()', 'source_count'))
"""
new = """    current = read(wikis)
    if old in current:
        write(wikis, current.replace(old, old.replace('source_paths.len()', 'source_count')))
"""
if source.count(old) != 1:
    raise SystemExit(f'expected one source-count loop body, found {source.count(old)}')
path.write_text(source.replace(old, new))
