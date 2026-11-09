import { describe, expect, it } from "vitest";
import { buildStaticPix, crc16, isValidCpf, normalizePixKey, parseEmv } from "@/lib/pix/brcode";
import { centsToDecimalString, formatBRL, parseBRLToCents } from "@/lib/money";

describe("dinheiro em centavos", () => {
  it("converte entradas em centavos sem erro de ponto flutuante", () => {
    expect(parseBRLToCents("9,00")).toBe(900);
    expect(parseBRLToCents("R$ 1.234,56")).toBe(123456);
    expect(parseBRLToCents("0.1")).toBe(10);
    expect(parseBRLToCents("12,5")).toBe(1250);
    expect(parseBRLToCents("abc")).toBeNull();
    expect(parseBRLToCents("1,234")).toBeNull();
    expect(centsToDecimalString(900)).toBe("9.00");
    expect(centsToDecimalString(5)).toBe("0.05");
    expect(formatBRL(900).replace(/\s/g, " ")).toBe("R$ 9,00");
  });
});

describe("BR Code Pix", () => {
  it("calcula CRC16/CCITT-FALSE corretamente", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("trata 47992145561 como celular (não é CPF válido)", () => {
    expect(isValidCpf("47992145561")).toBe(false);
    expect(normalizePixKey("47992145561")).toEqual({ key: "+5547992145561", type: "phone" });
    expect(normalizePixKey("(47) 99214-5561")).toEqual({ key: "+5547992145561", type: "phone" });
    expect(normalizePixKey("529.982.247-25")).toEqual({ key: "52998224725", type: "cpf" });
  });

  it("gera payload estático válido com valor, txid e CRC", () => {
    const payload = buildStaticPix({
      key: "+5547992145561",
      merchantName: "Diário do Gaúcho",
      merchantCity: "Porto Alegre",
      amountCents: 900,
      txid: "DGABC123",
    });
    const f = parseEmv(payload);
    expect(f["00"]).toBe("01");
    expect(f["53"]).toBe("986");
    expect(f["54"]).toBe("9.00");
    expect(f["58"]).toBe("BR");
    expect(f["59"]).toBe("DIARIO DO GAUCHO");
    expect(f["60"]).toBe("PORTO ALEGRE");
    const mai = parseEmv(f["26"]);
    expect(mai["00"]).toBe("br.gov.bcb.pix");
    expect(mai["01"]).toBe("+5547992145561");
    expect(parseEmv(f["62"])["05"]).toBe("DGABC123");
    // CRC confere com o restante do payload
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });

  it("recusa gerar Pix estático sem dados obrigatórios do recebedor", () => {
    expect(() =>
      buildStaticPix({ key: "+5547992145561", merchantName: "", merchantCity: "POA", amountCents: 900, txid: "X" }),
    ).toThrow();
    expect(() =>
      buildStaticPix({ key: "+5547992145561", merchantName: "A", merchantCity: "B", amountCents: 0, txid: "X" }),
    ).toThrow();
  });
});
