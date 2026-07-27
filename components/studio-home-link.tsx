"use client";

import Link from "next/link";
import { ProductIcon } from "@/components/product-icon";

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
      <ProductIcon />
      <span>ClavisFlow Studio</span>
    </Link>
  );
}
