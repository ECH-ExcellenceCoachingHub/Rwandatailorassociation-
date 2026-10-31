import { associationManifest } from "@/lib/pwa/app-routes";

/** RTA's app, served like every association's (app/[association]) but routed
 *  here, since the static /rta segment is RTA's own. */
export function GET() {
  return associationManifest("rta");
}
