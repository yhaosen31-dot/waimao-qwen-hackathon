import { completeNode, type LeadGenerationGraphState } from "@/graphs/state";
import { vemailProvider } from "@/providers/vemailProvider";

export async function searchEmailsByDomain(state: LeadGenerationGraphState) {
  const companies = await Promise.all(
    state.companies.map(async (company) => {
      const emailResults = await vemailProvider.invoke({
        domain: company.domain,
        companyName: company.name
      });

      return {
        ...company,
        emails: emailResults.map((emailResult) => emailResult.email),
        evidence: [
          ...company.evidence,
          {
            type: "email_mock" as const,
            title: "Mock email discovery",
            url: company.website,
            snippet: `Generated ${emailResults.length} mock emails via ${vemailProvider.name}.`,
            rawText: emailResults.map((emailResult) => emailResult.email).join(", "),
            confidence: 0.76
          }
        ]
      };
    })
  );

  return {
    companies,
    ...completeNode(
      state,
      "searchEmailsByDomain",
      `Generated mock emails for ${companies.length} domains.`
    )
  };
}
