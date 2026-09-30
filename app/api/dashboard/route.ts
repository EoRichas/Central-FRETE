import { canViewSellerCommission } from "@/lib/domain/permissions";
import { currentCompetency, isCompetency } from "@/lib/domain/dates";
import { saleForViewer } from "@/lib/server/seller-commission";
import { authorize } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/d1";
import { dashboard } from "@/lib/server/repository";

export async function GET(request: Request) {
  try {
    const user = await authorize(request);
    const url = new URL(request.url);
    const competency = url.searchParams.get("competency") || currentCompetency();
    if (!isCompetency(competency)) {
      return Response.json({ error: "Competência inválida." }, { status: 400 });
    }
    const data = await dashboard(user, competency);
    const showCommission = canViewSellerCommission(user.role);
    const bySeller = data.bySeller.map(seller => {
      if (showCommission) return seller;
      const { commissionCents, ...visible } = seller;
      void commissionCents;
      return visible;
    });
    return Response.json({ data: {
      ...data,
      showCommission,
      operationalCommissionCents: showCommission ? data.operationalCommissionCents : undefined,
      bySeller,
      upcoming: data.upcoming.map(sale => saleForViewer(sale, user)),
      overdue: data.overdue.map(sale => saleForViewer(sale, user)),
    } });
  } catch (error) {
    return jsonError(error);
  }
}
