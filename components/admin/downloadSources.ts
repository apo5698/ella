import type { ComponentType } from "react";
import QinglanhuaFields from "@/components/admin/QinglanhuaFields";
import BaiduShareFields from "@/components/admin/BaiduShareFields";
import {
  DOWNLOAD_SERVICES,
  type DownloadService,
} from "@/components/admin/downloadServices";
import { QINGLANHUA_DEFAULT_PASSWORD } from "@/lib/utilities/qinglanhuaSchema";
import type { DownloaderSource } from "@/lib/utilities/registry";

export type DownloadFieldErrors<TFields> = Partial<
  Record<keyof TFields, Array<{ message?: string }>>
>;

export type DownloadSourceFieldsProps<TFields> = {
  entryId: number;
  value: TFields;
  disabled: boolean;
  errors: DownloadFieldErrors<TFields>;
  hasConflict: boolean;
  onChange: <TKey extends keyof TFields>(
    field: TKey,
    value: TFields[TKey],
  ) => void;
};

type SourceForm = {
  // Each source types its own fields; the dialog only passes them through.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields: ComponentType<DownloadSourceFieldsProps<any>>;
  createFields: () => { name: string } & Record<string, string>;
  /** The service the source is hosted on, which must be set up first. */
  service?: DownloadService;
};

/** The part of the new download form that changes with the source. */
export const DOWNLOAD_SOURCE_FORMS: Record<DownloaderSource, SourceForm> = {
  qinglanhua: {
    fields: QinglanhuaFields,
    createFields: () => ({
      name: "",
      url: "",
      password: QINGLANHUA_DEFAULT_PASSWORD,
    }),
  },
  sykb: {
    fields: BaiduShareFields,
    createFields: () => ({ name: "", url: "", code: "" }),
    service: DOWNLOAD_SERVICES.baidu,
  },
};
