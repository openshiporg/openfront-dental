import { ListPage } from "@/features/dashboard/screens/ListPage";
import { requirePage } from "@/features/platform/lib/server";

/** Raw record pages are for admin roles (canManageRoles); everyone else works from the platform pages. */
export default async function Page(props: Parameters<typeof ListPage>[0]) {
  await requirePage("records");
  return ListPage(props);
}
