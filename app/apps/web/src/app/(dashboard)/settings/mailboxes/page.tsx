import { redirect } from "next/navigation";

export default function MailboxesRedirect() {
  redirect("/settings/mail-calendar");
}
