"use client";

import { useSyncExternalStore } from "react";
import { Pencil } from "lucide-react";
import { editUrl, findManagedFlow } from "@/lib/flow-store";

const subscribe = () => () => undefined;

function currentEditUrl() {
  const publicId = new URLSearchParams(window.location.search).get("flow");
  const flow = publicId ? findManagedFlow(publicId) : undefined;
  return flow ? editUrl(flow) : "";
}

export function PublicFlowEditLink() {
  const href = useSyncExternalStore(subscribe, currentEditUrl, () => "");

  if (!href) return null;

  return <a className="public-edit-link" href={href}><Pencil size={15} aria-hidden="true" />この処理を編集</a>;
}
