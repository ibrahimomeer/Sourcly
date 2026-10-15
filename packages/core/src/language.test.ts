import { describe, expect, it } from "vitest";
import {
  UNKNOWN_LANGUAGE,
  countLanguages,
  detectLanguage,
  languageBadge,
  languageExplanation,
  languageName,
  languageOf,
  resolveLanguage,
} from "./language";

const doc = (title: string, abstract: string | null = null, language: string | null = null) => ({ title, abstract, language });

describe("languageName", () => {
  it("writes a language code as its English name", () => {
    expect(languageName("en")).toBe("English");
    expect(languageName("pt")).toBe("Portuguese");
    expect(languageName("zh")).toBe("Chinese");
    expect(languageName("vi")).toBe("Vietnamese");
  });

  it("calls a missing language unknown", () => {
    expect(languageName(null)).toBe("unknown");
    expect(languageName(UNKNOWN_LANGUAGE)).toBe("unknown");
  });

  it("shows a code it does not know in capitals instead of failing", () => {
    expect(languageName("xx")).toBe("XX");
    expect(languageName("not a code!")).toBe("NOT A CODE!");
  });
});

describe("detectLanguage: samples", () => {
  const samples: [string, string, string][] = [
    ["en", "title and abstract", "Sleep-dependent memory consolidation in the human brain. We examined the effects of sleep on the retention of newly learned information and found that the results were consistent with the active systems account."],
    ["en", "a plain English title", "Dynamics and non-integrability of the variable-length double pendulum: exploring chaos and periodicity"],
    ["es", "a title", "Rotura de maquinaria: Una explicación a partir de la Teoría del Caos"],
    ["es", "an abstract", "En este trabajo se estudia el comportamiento de los sistemas dinámicos no lineales y su aplicación en la ingeniería, con especial atención a las condiciones iniciales."],
    ["pt", "a title", "Simulação do Pêndulo Duplo como Ferramenta para o Ensino do Caos"],
    ["pt", "an abstract", "Este trabalho apresenta uma análise do comportamento de osciladores forçados e a sua aplicação no ensino de física para os alunos do ensino médio."],
    ["vi", "a title", "Thiết kế và tối ưu hóa bộ điều khiển Fuzzy-Pid sử dụng thuật toán di truyền để điều khiển cần cẩu trên cao"],
    ["vi", "a short title", "Đánh giá hiệu quả của gối con lắc ma sát đôi sử dụng trong công trình"],
    ["tr", "a title", "Derin öğrenme yöntemleri ile görüntü sınıflandırma üzerine bir çalışma ve sonuçların değerlendirilmesi"],
    ["ru", "a title", "Исследование хаотической динамики двойного маятника и её применение в задачах управления"],
    ["zh", "a title", "基于深度学习的分子气味预测方法研究"],
    ["ja", "a title", "分子の構造から匂いを予測する機械学習の研究"],
    ["ko", "a title", "분자 구조로부터 냄새를 예측하는 기계 학습 연구"],
    ["fr", "an abstract", "Cette étude porte sur le comportement des systèmes dynamiques et leur application dans les domaines de la physique et de l'ingénierie pour les étudiants de l'université."],
    ["de", "an abstract", "Diese Arbeit untersucht das Verhalten von nichtlinearen Systemen und ihre Anwendung in der Technik, mit besonderem Augenmerk auf die Anfangsbedingungen der Bewegung."],
    ["it", "an abstract", "Questo lavoro studia il comportamento dei sistemi dinamici non lineari e la loro applicazione nell'ingegneria, con particolare attenzione alle condizioni iniziali del moto."],
    ["el", "a title", "Μελέτη της χαοτικής δυναμικής του διπλού εκκρεμούς"],
    ["ar", "a title", "دراسة الديناميكيات الفوضوية للبندول المزدوج وتطبيقاتها"],
  ];
  it.each(samples)("reads %s from %s", (code, _what, text) => {
    expect(detectLanguage(text)).toBe(code);
  });

  it("is not fooled by a Vietnamese paper being called English by a source", () => {
    const info = resolveLanguage(doc("Thiết kế và tối ưu hóa bộ điều khiển Fuzzy-Pid sử dụng thuật toán di truyền", null, "en"));
    expect(info).toMatchObject({ detected: "vi", reported: "en", status: "unclear", code: "vi" });
  });

  it("says nothing when the text has too little to go on", () => {
    expect(detectLanguage("")).toBeNull();
    expect(detectLanguage("Double Pendulum")).toBeNull();
    expect(detectLanguage("12345 6789")).toBeNull();
    expect(detectLanguage("Chaos in a double pendulum")).toBeNull();
  });

  it("says nothing when two languages score about the same", () => {
    // "de la" and "in a" appear in several languages' lists.
    expect(detectLanguage("a de la in")).toBeNull();
  });

  it("is deterministic", () => {
    const text = "Este trabajo estudia el comportamiento de los sistemas dinámicos para la ingeniería";
    expect(detectLanguage(text)).toBe(detectLanguage(text));
  });

  it("reads only the start of a long text", () => {
    const long = `${"Este trabajo estudia el comportamiento de los sistemas. ".repeat(30)}${"the of and in to for with on by is are from at ".repeat(200)}`;
    expect(detectLanguage(long)).toBe("es");
  });
});

describe("resolveLanguage: detected, from the source, unclear or unknown", () => {
  const english = "Sleep-dependent memory consolidation in the human brain: the effects of sleep on the retention of information";

  it("is detected when the text says it and the source agrees or says nothing", () => {
    expect(resolveLanguage(doc(english, null, "en"))).toMatchObject({ code: "en", status: "detected" });
    expect(resolveLanguage(doc(english))).toMatchObject({ code: "en", status: "detected", reported: null });
  });

  it("uses the source's word when the text is too short to tell", () => {
    expect(resolveLanguage(doc("Double Pendulum", null, "en"))).toMatchObject({ code: "en", status: "reported", detected: null });
  });

  it("is unclear when the text and the source disagree, and is placed by the text", () => {
    expect(resolveLanguage(doc(english, null, "pt"))).toMatchObject({ code: "en", detected: "en", reported: "pt", status: "unclear" });
  });

  it("is unknown when neither says anything", () => {
    expect(resolveLanguage(doc("Double Pendulum"))).toMatchObject({ code: null, status: "unknown" });
  });

  it("gives the same answer for the same record", () => {
    const record = doc(english);
    expect(resolveLanguage(record)).toBe(resolveLanguage(record));
  });
});

describe("languageBadge and languageExplanation", () => {
  const english = "Sleep-dependent memory consolidation in the human brain: the effects of sleep on the retention of information";

  it("writes each case as the card shows it", () => {
    expect(languageBadge(resolveLanguage(doc(english)))).toBe("Language: English (detected)");
    expect(languageBadge(resolveLanguage(doc("Double Pendulum", null, "en")))).toBe("Language: English (from the source)");
    expect(languageBadge(resolveLanguage(doc(english, null, "pt")))).toBe("Language unclear");
    expect(languageBadge(resolveLanguage(doc("Double Pendulum")))).toBe("Language: unknown");
  });

  it("explains each case", () => {
    expect(languageExplanation(resolveLanguage(doc(english)))).toMatch(/heuristic/);
    expect(languageExplanation(resolveLanguage(doc(english, null, "pt")))).toBe(
      "The text looks English but the source says Portuguese. The result is placed by what the text looks like.",
    );
  });
});

describe("languageOf and countLanguages", () => {
  const english = "Sleep-dependent memory consolidation in the human brain: the effects of sleep on the retention of information";
  const spanish = "Este trabajo estudia el comportamiento de los sistemas dinámicos para la ingeniería";
  const results = [doc(english), doc(english), doc(spanish), doc("Double Pendulum"), doc("Double Pendulum"), doc("Double Pendulum", null, "pt")];

  it("is the language a result is placed by, or unknown", () => {
    expect(languageOf(doc(english))).toBe("en");
    expect(languageOf(doc("Double Pendulum"))).toBe("unknown");
    expect(languageOf(doc("Double Pendulum", null, "pt"))).toBe("pt");
  });

  it("counts each language, most first, with unknown last however many there are", () => {
    expect(countLanguages(results)).toEqual([
      { code: "en", name: "English", count: 2 },
      { code: "pt", name: "Portuguese", count: 1 },
      { code: "es", name: "Spanish", count: 1 },
      { code: "unknown", name: "unknown", count: 2 },
    ]);
  });

  it("lists a chosen language even when no result has it", () => {
    expect(countLanguages([doc(english)], ["de"])).toEqual([
      { code: "en", name: "English", count: 1 },
      { code: "de", name: "German", count: 0 },
    ]);
  });

  it("is empty for no results and nothing chosen", () => {
    expect(countLanguages([])).toEqual([]);
  });
});
