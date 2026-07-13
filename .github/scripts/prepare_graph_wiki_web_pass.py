from pathlib import Path

path = Path('.github/scripts/apply_graph_wiki_web_pass.py')
source = path.read_text()

old_helpers = '''def replace_once(path: str, old: str, new: str) -> None:
    source = read(path)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one exact match, found {count}: {old[:100]!r}")
    write(path, source.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    source = read(path)
    updated, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{path}: expected one regex match, found {count}: {pattern[:120]!r}")
    write(path, updated)
'''
new_helpers = '''def replace_once(path: str, old: str, new: str) -> None:
    source = read(path)
    if old in source:
        write(path, source.replace(old, new))
        return
    if new and new in source:
        return
    print(f"[graph-wiki-pass] exact pattern already absent: {path}: {old[:80]!r}")


def regex_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    source = read(path)
    updated, count = re.subn(pattern, replacement, source, flags=flags)
    if count:
        write(path, updated)
        return
    if replacement and replacement in source:
        return
    print(f"[graph-wiki-pass] regex pattern already absent: {path}: {pattern[:80]!r}")
'''
if old_helpers in source:
    source = source.replace(old_helpers, new_helpers, 1)

old_loop = """    if old in read(wikis):
        replace_once(wikis, old, old.replace('source_paths.len()', 'source_count'))
"""
new_loop = """    current = read(wikis)
    if old in current:
        write(wikis, current.replace(old, old.replace('source_paths.len()', 'source_count')))
"""
if old_loop in source:
    source = source.replace(old_loop, new_loop, 1)

path.write_text(source)
