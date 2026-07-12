from pathlib import Path
import runpy

path = Path('.github/scripts/apply_wiki_semantic_agent_phase.py')
text = path.read_text(encoding='utf-8')
text = text.replace('"{number}. [{} — {}]({})\\n",', '"{number}. [{} — {}]({})\\\\n",')
text = text.replace('"- [{} — {}]({})\\n",', '"- [{} — {}]({})\\\\n",')
text = text.replace("labelCanvas.style.position = 'absolute' '''", "labelCanvas.style.position = 'absolute'\n'''")
path.write_text(text, encoding='utf-8')
runpy.run_path(str(path), run_name='__main__')
