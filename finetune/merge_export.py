"""Gabungkan adaptor LoRA ke model dasar (bf16) lalu simpan; konversi GGUF dilakukan llama.cpp (lihat README)."""
import sys, torch
from peft import AutoPeftModelForCausalLM
from transformers import AutoTokenizer
src, dst = (sys.argv + ["out/lora-notam", "out/merged"][len(sys.argv) - 1:])[1:3]
m = AutoPeftModelForCausalLM.from_pretrained(src, torch_dtype=torch.float16).merge_and_unload()
m.save_pretrained(dst, safe_serialization=True)
AutoTokenizer.from_pretrained(src).save_pretrained(dst)
print("tersimpan ->", dst)
