import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function HubSpotConnectionCard() {
  const connection = trpc.hubspot.status.useQuery();
  const beginAuthorization = trpc.hubspot.beginAuthorization.useMutation({
    onSuccess: result => {
      window.location.assign(result.authorizationUrl);
    },
    onError: error => toast.error(error.message),
  });
  return <section className="panel"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2>HubSpot MCP connection</h2><p className="mt-1 text-sm text-[#60766c]">Read-only CRM enrichment is {connection.data?.connected ? "connected" : "not connected"}. HubSpot consent is required before account data can enter triage.</p></div><Button onClick={() => beginAuthorization.mutate()} disabled={beginAuthorization.isPending || connection.data?.connected}>{connection.data?.connected ? "Connected" : beginAuthorization.isPending ? "Preparing authorization…" : "Connect HubSpot"}</Button></div>
  </section>;
}
