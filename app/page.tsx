import { redirect } from "next/navigation";

// The customer-facing storefront is built only from the design image the owner
// picks in the Storefronts app. Until then the root goes to the staff dashboard.
export default function Home() {
  redirect("/dashboard");
}
