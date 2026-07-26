"use client";

import Link from "next/link";
import { Workflow } from "lucide-react";

export function StudioHomeLink() {
  return (
    <Link
      className="brand"
      href="/"
      aria-label="ClavisFlow Studio"
      onClick={(event) => {
        event.preventDefault();
        window.location.assign("/");
      }}
    >
      <span className="brand-mark"><Workflow size={18} aria-hidden="true" /></span>
      <span>ClavisFlow Studio</span>
    </Link>
  );
}
