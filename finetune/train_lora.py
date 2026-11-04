"""QLoRA Qwen3-8B untuk NOTAM. Jalankan di mesin ber-GPU (>=16 GB VRAM; Colab T4 cukup tapi lambat).

  pip install -U "transformers>=4.51" peft trl datasets bitsandbytes accelerate
  python train_lora.py --train out/train.jsonl --val out/val.jsonl --out out/lora-notam

Prompt di JSONL sudah sama persis dengan prompt aplikasi; loss hanya dihitung pada jawaban NOTAM.
"""
import argparse, json
import torch
from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from trl import SFTConfig, SFTTrainer

ap = argparse.ArgumentParser()
ap.add_argument("--model", default="Qwen/Qwen3-8B")
ap.add_argument("--train", default="out/train.jsonl")
ap.add_argument("--val", default="out/val.jsonl")
ap.add_argument("--out", default="out/lora-notam")
ap.add_argument("--epochs", type=float, default=2)
ap.add_argument("--lr", type=float, default=1e-4)
ap.add_argument("--max-len", type=int, default=3072)
a = ap.parse_args()

DT = torch.bfloat16 if torch.cuda.get_device_capability()[0] >= 8 else torch.float16  # Colab T4 tidak mendukung bf16

tok = AutoTokenizer.from_pretrained(a.model)
tok.pad_token = tok.pad_token or tok.eos_token

def render(ex):
    # Mode tanpa thinking (aplikasi memanggil Ollama dengan think:false).
    msgs = ex["messages"]
    prompt = tok.apply_chat_template(msgs[:1], tokenize=False, add_generation_prompt=True, enable_thinking=False)
    return {"prompt": prompt, "completion": msgs[1]["content"] + tok.eos_token}

ds = load_dataset("json", data_files={"train": a.train, "val": a.val}).map(render, remove_columns=["messages"])

model = AutoModelForCausalLM.from_pretrained(
    a.model, dtype=DT,
    quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=DT, bnb_4bit_use_double_quant=True),
)
cfg = SFTConfig(
    output_dir=a.out, num_train_epochs=a.epochs, learning_rate=a.lr, lr_scheduler_type="cosine", warmup_steps=8,
    per_device_train_batch_size=1, gradient_accumulation_steps=8, gradient_checkpointing=True, bf16=(DT == torch.bfloat16), fp16=(DT == torch.float16),
    max_length=a.max_len, completion_only_loss=True, logging_steps=5,
    eval_strategy="epoch", save_strategy="epoch", save_total_limit=2, report_to="none",
)
lora = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, task_type="CAUSAL_LM",
                  target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"])
trainer = SFTTrainer(model=model, args=cfg, train_dataset=ds["train"], eval_dataset=ds["val"], peft_config=lora, processing_class=tok)
for p in trainer.model.parameters():
    if p.requires_grad: p.data = p.data.float()  # fp16 AMP butuh bobot latih float32
trainer.train()
trainer.model.save_pretrained(a.out)
tok.save_pretrained(a.out)
print("selesai ->", a.out)
