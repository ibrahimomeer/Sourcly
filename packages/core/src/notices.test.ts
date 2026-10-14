import { describe, expect, it } from "vitest";
import { NOTICE_LABELS, noticeKind } from "./notices";

const kind = (title: string) => noticeKind({ title });

describe("noticeKind: titles seen on real notices (Crossref and OpenAlex, 2026-10-14)", () => {
  it.each([
    "Retraction notice: Downregulation of long noncoding RNA LINC01419 inhibits cell migration",
    "Retraction: Effect of Treadmill Exercise on Bone Mass in Female Rats",
    "Retraction and Republication: Primary Prevention of Cardiovascular Disease with a Mediterranean Diet",
    "Retraction—Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19",
    "Withdrawn: Clinical manifestations and outcome of SARS-CoV-2 infection during pregnancy",
    "Retraction Note: A paper",
    "Notice of Retraction: A paper",
    "Retraction",
    "RETRACTION: A paper",
    "Withdrawal notice: A paper",
  ])("reads %j as a retraction notice", (title) => {
    expect(kind(title)).toBe("retraction-notice");
  });

  it.each([
    "Erratum: mechanisms responsible for the initiation of a fast breakdown",
    "Erratum to: Di-boson signatures as standard candles for partial compositeness",
    "Erratum Corrige",
    "Corrigendum",
    "Corrigendum to “Seizures and Irreversible Cardiogenic Shock Following Propranolol Poisoning”",
    "Corrigendum: Predicting multiple types of associations between miRNAs and diseases",
    "Correction: Virus-Like Nanoparticle Vaccine Confers Protection against Toxoplasma gondii",
    "Correction",
    "Correction to: A paper",
    "Correction to “A paper”",
    "Author Correction",
    "AUTHOR CORRECTION",
    "Publisher Correction: Publisher correction for multiple articles",
    "Errata",
  ])("reads %j as a correction notice", (title) => {
    expect(kind(title)).toBe("correction-notice");
  });

  it.each([
    "Expression of concern for “‘Recoverin as a paraneoplastic antigen in lung cancer’”",
    "Expression of Concern for: Inhibition of CXCR4 by MicroRNA-1192 Reduces the Activation",
    "Editorial Expression of Concern: A paper",
  ])("reads %j as an expression of concern", (title) => {
    expect(kind(title)).toBe("expression-of-concern");
  });

  it("ignores markup, brackets, quotes and capitals around the start of the title", () => {
    expect(kind("<scp>EXPRESSION OF CONCERN</scp> : CircWHSC1 promotes")).toBe("expression-of-concern");
    expect(kind("  [Retraction: A paper]")).toBe("retraction-notice");
    expect(kind("“Erratum” for a paper")).toBe("correction-notice");
  });
});

describe("noticeKind: titles that only look similar", () => {
  it.each([
    // Research papers OpenAlex files under its "erratum" type.
    "Self-interaction correction to density-functional approximations for many-electron systems",
    "Correction of flux measurements for density effects due to heat and water vapour transfer",
    "Correction for multiple comparisons in neuroimaging",
    "Correction to density functional theory for dispersion",
    // The article that was retracted is research, and is flagged through Result.retraction.
    "RETRACTED ARTICLE: Deep Reinforcement Learning-Based Smart Manufacturing Plants",
    "RETRACTED: LRRK2 kinase activity mediates toxic interactions between genetic mutation",
    "Retraction of axons in the developing spinal cord",
    "Withdrawal symptoms in adolescents who stop using cannabis",
    "Corrections officers and sleep",
    "Erratic sleep in shift workers",
    "Sleep and memory consolidation",
    "",
  ])("does not read %j as a notice", (title) => {
    expect(kind(title)).toBeNull();
  });
});

describe("NOTICE_LABELS", () => {
  it("has a plain label for every kind", () => {
    expect(NOTICE_LABELS).toEqual({
      "retraction-notice": "Retraction notice",
      "correction-notice": "Correction notice",
      "expression-of-concern": "Expression of concern",
    });
  });
});
