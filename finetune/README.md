# Fine-tuning NOTAM (persiapan)

Folder ini tidak dipakai aplikasi yang berjalan. Isinya bahan untuk melatih adaptor LoRA di atas Qwen3-8B.

## Isi
- `build-dataset.ts` membuat `out/train.jsonl`, `out/val.jsonl`, `out/val-cases.json`, `out/report.md`.
  - Label dibersihkan memakai koreksi baku aplikasi (FIR dari master, CLSD untuk area gerak, tanpa TEMPORARILY, tanpa alasan karangan) lalu divalidasi; yang masih error dibuang.
  - Baris yang ditandai berat di `Daftar-Data-Bermasalah-NOTAM-Dataset.xlsx` (`problem-rows.json`) dibuang.
  - Hampir-duplikat dikelompokkan sebelum membagi latih/uji, jadi uji tidak bocor.
  - Prompt = `buildPrompt` aplikasi, dengan contoh few-shot hanya dari data latih.
- `train_lora.py` QLoRA (4-bit, r=16), loss hanya pada jawaban NOTAM.
- `merge_export.py` menggabungkan adaptor ke model.

## Langkah
1. `npx ts-node --transpile-only finetune/build-dataset.ts` (sudah dijalankan; ulangi bila `examples.json` berubah).
2. Di mesin ber-GPU (>=16 GB VRAM) atau Colab: `python train_lora.py`, lalu `python merge_export.py`.
3. Konversi adaptor ke GGUF (`convert_lora_to_gguf.py`), lalu Modelfile: `FROM qwen3:8b` + `ADAPTER ./notam-lora.gguf`.
4. `ollama create notam-ft -f Modelfile`.
5. Bandingkan dengan model dasar pada set uji yang sama:
   `EVAL_SET=finetune/out/val-cases.json LLM_PROVIDER=ollama LLM_MODEL=qwen3:8b npx ts-node --transpile-only test/eval.ts 100`
   lalu ulangi dengan `LLM_MODEL=notam-ft`. Pakai fine-tune hanya jika Q, B, C dan jumlah koreksi sistem membaik.

## Batas yang jujur
- Set uji ~108 contoh: selisih kecil tidak bermakna.
- `eval.ts` memakai retrieval seluruh dataset, jadi hasil sedikit optimistis untuk kedua model.
- Dataset dan aturan AirNav terus berubah; model hasil latih perlu dilatih ulang saat itu.
