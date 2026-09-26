import { defineMigration } from '@blixis/contracts'

/**
 * Multipart uploads in progress (ADR 0013 §1): the storage's upload id, the declared size, and
 * the part size clients must use. Cleared when the upload completes.
 */
export const addUploads = defineMigration({
  id: '0002_add_uploads',
  up: /* sql */ `
    alter table assets.assets
      add column upload_id text,
      add column upload_size bigint check (upload_size > 0),
      add column upload_part_size integer check (upload_part_size > 0);
  `,
})
