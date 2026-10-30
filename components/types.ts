import type { AppData } from "@/lib/types";
import type { Store } from "@/lib/store";
export interface TabProps {
  d: AppData;
  store: Store;
  month: string;
}
