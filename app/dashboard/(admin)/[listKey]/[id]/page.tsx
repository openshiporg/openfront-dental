import { ItemPage } from "@/features/dashboard/screens/ItemPage";
import { requirePage } from "@/features/platform/lib/server";

/** Raw record pages are for admin roles (canManageRoles); everyone else works from the platform pages. */
export default async function Page(props: Parameters<typeof ItemPage>[0]) {
  await requirePage("records");
  return ItemPage(props);
}
