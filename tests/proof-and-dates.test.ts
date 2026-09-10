import assert from "node:assert/strict";
import test from "node:test";
import { readPaymentProof } from "../lib/server/payment-proof.ts";
import { currentCompetency, isCompetency } from "../lib/domain/dates.ts";

test("mês atual respeita São Paulo na virada do mês e do ano", () => {
  assert.equal(currentCompetency(new Date("2026-10-01T01:00:00Z")), "2026-09");
  assert.equal(currentCompetency(new Date("2026-10-01T03:00:00Z")), "2026-10");
  assert.equal(currentCompetency(new Date("2027-01-01T02:59:59Z")), "2026-12");
  assert.equal(isCompetency("2026-13"), false);
});

test("comprovante é identificado pelo conteúdo, incluindo imagens sem MIME do navegador", async () => {
  for (const [bytes, mime] of [
    [Buffer.from("%PDF-1.4\n%%EOF"), "application/pdf"],
    [Buffer.from([255,216,255,224,0,16]), "image/jpeg"],
    [Buffer.from([137,80,78,71,13,10,26,10]), "image/png"],
    [Buffer.from("RIFF1234WEBP"), "image/webp"],
    [Buffer.from("GIF89a"), "image/gif"],
    [Buffer.from([73,73,42,0]), "image/tiff"],
  ] as const) {
    const file = await readPaymentProof(new File([bytes], "comprovante", {type:""}));
    assert.equal(file.mimeType, mime);
  }
});

test("arquivos disfarçados, SVG ativo, vazios e maiores que 10 MB são rejeitados", async () => {
  await assert.rejects(readPaymentProof(new File(["<script>alert(1)</script>"], "pago.png", {type:"image/png"})), /Formato/);
  await assert.rejects(readPaymentProof(new File(["<svg onload='alert(1)'></svg>"], "pago.svg", {type:"image/svg+xml"})), /Formato/);
  await assert.rejects(readPaymentProof(new File([], "pago.pdf")), /até 10 MB/);
  await assert.rejects(readPaymentProof(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "pago.jpg")), /até 10 MB/);
});
