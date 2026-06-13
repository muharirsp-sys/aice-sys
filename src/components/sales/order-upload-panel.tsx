"use client";

import { BulkUploadButton } from "@/components/ui/bulk-upload-button";
import { uploadOrderAction } from "@/server/upload-order-action";

export function OrderUploadPanel() {
  return (
    <BulkUploadButton
      module="order"
      dialogTitle="Order"
      uploadAction={uploadOrderAction as (rows: Record<string, unknown>[]) => ReturnType<typeof uploadOrderAction>}
      errorFilename="error-order.xlsx"
    />
  );
}
