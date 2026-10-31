"""Convertit ProtoQA (questions Family Feud transcrites par des fans, CC-BY-4.0) en JSON + SQLite.

Usage : python3 -I build_ff.py <dossier protoqa-data/data> <dossier de sortie>
Source : https://github.com/iesl/protoqa-data  (Boratko et al., 2020)
On garde uniquement les données "scraped" (vraies émissions) : train + dev.scraped.
Les 29 questions de omitted.jsonl et les données crowdsourcées sont exclues.
"""
import json
import re
import sqlite3
import sys
from pathlib import Path

data_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)

SRC_NAMES = {
    "https://www.familyfeudinfo.com": "familyfeudinfo.com",
    "http://familyfeudfriends.arjdesigns.com/": "familyfeudfriends.arjdesigns.com",
}


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def load(rel, split):
    for line in open(data_dir / rel, encoding="utf-8"):
        r = json.loads(line)
        yield split, r


omitted = {
    clean(json.loads(l)["question"]["normalized"])
    for l in open(data_dir / "omitted/omitted.jsonl", encoding="utf-8")
}

questions, seen = [], set()
for split, r in list(load("train/train.jsonl", "train")) + list(load("dev/dev.scraped.jsonl", "dev")):
    qn = clean(r["question"]["normalized"])
    if qn in seen or qn in omitted:
        continue
    seen.add(qn)
    reps = [
        {"texte": clean(t), "points": int(p)}
        for t, p in r["answers"]["raw"].items()
        if clean(t) and int(p) > 0
    ]
    reps.sort(key=lambda x: -x["points"])  # tri stable : l'ordre source départage les égalités
    if not reps:
        continue
    total = sum(x["points"] for x in reps)
    questions.append(
        {
            "id": len(questions) + 1,
            "source_id": r["metadata"]["id"],
            "source": SRC_NAMES.get(r["metadata"]["source"], r["metadata"]["source"]),
            "split": split,
            "question": clean(r["question"]["original"]),
            "question_norm": qn,
            "total_points": total,
            # fiable = total plausible d'un tableau de 100 personnes interrogées
            "fiable": 50 <= total <= 100,
            "reponses": reps,
        }
    )

json.dump(
    {
        "meta": {
            "jeu": "Family Feud (questions d'émissions, transcriptions de fans)",
            "langue": "en",
            "source": "https://github.com/iesl/protoqa-data",
            "licence": "CC-BY-4.0 — Boratko, Li, O'Gorman, Das, Le, McCallum (2020), ProtoQA",
            "nb_questions": len(questions),
        },
        "questions": questions,
    },
    open(out_dir / "family_feud_en.json", "w", encoding="utf-8"),
    ensure_ascii=False,
    separators=(",", ":"),
)

db = out_dir / "family_feud_en.db"
db.unlink(missing_ok=True)
con = sqlite3.connect(db)
con.executescript(
    """
    CREATE TABLE questions (
        id INTEGER PRIMARY KEY,
        source_id TEXT NOT NULL,
        source TEXT NOT NULL,
        split TEXT NOT NULL,
        texte TEXT NOT NULL,
        texte_norm TEXT NOT NULL UNIQUE,
        nb_reponses INTEGER NOT NULL,
        total_points INTEGER NOT NULL,
        fiable INTEGER NOT NULL
    );
    CREATE TABLE reponses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id INTEGER NOT NULL REFERENCES questions(id),
        rang INTEGER NOT NULL,
        texte TEXT NOT NULL,
        points INTEGER NOT NULL,
        UNIQUE (question_id, rang)
    );
    CREATE INDEX idx_rep_q ON reponses(question_id);
    CREATE INDEX idx_rep_texte ON reponses(texte);
    CREATE INDEX idx_q_filtre ON questions(fiable, nb_reponses);
    """
)
for q in questions:
    con.execute(
        "INSERT INTO questions VALUES (?,?,?,?,?,?,?,?,?)",
        (q["id"], q["source_id"], q["source"], q["split"], q["question"], q["question_norm"],
         len(q["reponses"]), q["total_points"], int(q["fiable"])),
    )
    con.executemany(
        "INSERT INTO reponses(question_id, rang, texte, points) VALUES (?,?,?,?)",
        [(q["id"], i, r["texte"], r["points"]) for i, r in enumerate(q["reponses"], 1)],
    )
try:
    con.executescript(
        "CREATE VIRTUAL TABLE questions_fts USING fts5(texte, content='questions', content_rowid='id');"
        "INSERT INTO questions_fts(rowid, texte) SELECT id, texte FROM questions;"
    )
    fts = True
except sqlite3.OperationalError:
    fts = False
con.commit()

n = con.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
nf = con.execute("SELECT COUNT(*) FROM questions WHERE fiable=1").fetchone()[0]
nr = con.execute("SELECT COUNT(*) FROM reponses").fetchone()[0]
print(f"OK : {n} questions ({nf} fiables), {nr} réponses, FTS5={'oui' if fts else 'non'}")
con.close()
