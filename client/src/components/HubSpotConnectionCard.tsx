import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy } from "lucide-react";
import { toast } from "sonner";

export default function HubSpotConnectionCard() {
  const connection = trpc.hubspot.status.useQuery();
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const beginAuthorization = trpc.hubspot.beginAuthorization.useMutation({
    onSuccess: async result => {
      setAuthorizationUrl(result.authorizationUrl);
      await navigator.clipboard?.writeText(result.authorizationUrl);
      toast.success("Secure HubSpot authorization URL copied. Open it in your normal browser if Cloudflare blocks this preview.");
    },
    onError: error => toast.error(error.message),
  });
  const completeAuthorization = trpc.hubspot.completeManualAuthorization.useMutation({
    onSuccess: () => {
      toast.success("HubSpot MCP connection established.");
      setCallbackUrl(""); setAuthorizationUrl(""); connection.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const copyAuthorizationUrl = async () => { await navigator.clipboard?.writeText(authorizationUrl); toast.success("Authorization URL copied."); };
  return <section className="panel"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2>HubSpot MCP connection</h2><p className="mt-1 text-sm text-[#60766c]">Read-only CRM enrichment is {connection.data?.connected ? "connected" : "not connected"}. HubSpot consent is required before account data can enter triage.</p></div><Button onClick={() => beginAuthorization.mutate()} disabled={beginAuthorization.isPending || connection.data?.connected}>{connection.data?.connected ? "Connected" : beginAuthorization.isPending ? "Preparing authorization…" : "Prepare HubSpot connection"}</Button></div>
    {!connection.data?.connected && <p className="mt-3 rounded-lg bg-[#fff2cf] px-3 py-2 text-xs text-[#785500]"><b>PKCE is automatic.</b> Do not paste a verifier or challenge. Selecting the button creates a one-time signed authorization session and stores the verifier encrypted on the server.</p>}
    {authorizationUrl && <div className="mt-5 rounded-xl border border-[#d6ded7] bg-[#f7faf7] p-4"><p className="text-sm font-semibold">Cloudflare fallback</p><p className="mt-1 text-sm text-[#60766c]">The secure authorization URL has been copied. Open it in your normal browser, complete HubSpot consent, then paste the complete redirected Light Labs callback URL below if the redirect did not finish automatically.</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={copyAuthorizationUrl}><Copy size={14} className="mr-2"/>Copy authorization URL</Button><a className="text-sm font-semibold text-[#176344] underline underline-offset-4" href={authorizationUrl} target="_blank" rel="noreferrer">Open authorization</a></div><Textarea className="mt-4 bg-white" placeholder="Paste the full https://lighttriage…/integrations/hubspot/callback?code=…&state=… URL" value={callbackUrl} onChange={event => setCallbackUrl(event.target.value)} /><Button className="mt-3" onClick={() => completeAuthorization.mutate({ callbackUrl })} disabled={completeAuthorization.isPending || !callbackUrl}>{completeAuthorization.isPending ? "Completing connection…" : "Complete HubSpot connection"}</Button></div>}
  </section>;
}
