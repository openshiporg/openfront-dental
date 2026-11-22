import { CreatePage } from "@/features/dashboard/screens/CreatePage";
import { requirePage } from "@/features/platform/lib/server";

/** Raw record pages are for admin roles (canManageRoles); everyone else works from the platform pages. */
export default async function Page(props: Parameters<typeof CreatePage>[0]) {
  await requirePage("records");
  return CreatePage(props);
}
