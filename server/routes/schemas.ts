import { z } from 'zod';

const id = z.string().min(1).max(64);
export const EligibilitySchema = z.object({ eligible: z.boolean() });
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();
export const CustomerBody = z.strictObject({
  companyName: z.string().trim().min(1).max(200),
  industry: optionalText(200),
  size: optionalText(100),
  source: optionalText(200),
  ownerId: id.optional(),
  status: z.enum(['potential', 'active', 'lost']).default('potential'),
  grade: z.enum(['A', 'B', 'C']).nullable().optional(),
  notes: optionalText(10000),
});
export const CustomerPatch = CustomerBody.omit({ ownerId: true })
  .partial()
  .extend({
    version: z.number().int().min(1),
  });
export const OwnerTransferBody = z.strictObject({
  ownerId: id,
  version: z.number().int().min(1),
});
export const ContactBody = z.strictObject({
  name: z.string().trim().min(1).max(200),
  position: optionalText(200),
  phone: optionalText(100),
  email: z.email().max(320).nullable().optional(),
});
export const ContactPatch = ContactBody.partial().extend({
  version: z.number().int().min(1),
});
export const CustomerParams = z.object({ customerId: id });
export const ContactParams = CustomerParams.extend({ contactId: id });
export const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const CustomerQuery = ListQuery.extend({
  search: z.string().trim().max(200).optional(),
  exactName: z.string().trim().max(200).optional(),
  ownerId: id.optional(),
  status: z.enum(['potential', 'active', 'lost']).optional(),
  grade: z.enum(['A', 'B', 'C']).optional(),
  sort: z.enum(['updatedAtDesc', 'updatedAtAsc']).default('updatedAtDesc'),
});
export const OwnerSchema = z.object({ id, name: z.string() });
export const PageMeta = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});
export const CustomerSchema = z.object({
  id,
  companyName: z.string(),
  industry: z.string().nullable(),
  size: z.string().nullable(),
  source: z.string().nullable(),
  ownerId: id,
  owner: OwnerSchema.nullable(),
  status: z.enum(['potential', 'active', 'lost']),
  grade: z.enum(['A', 'B', 'C']).nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdById: id,
  version: z.number(),
});
export const ContactSchema = z.object({
  id,
  customerId: id,
  name: z.string(),
  position: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdById: id,
  version: z.number(),
});
export type CustomerView = z.infer<typeof CustomerSchema>;
export type ContactView = z.infer<typeof ContactSchema>;

export const TeamBody = z.strictObject({
  name: z.string().trim().min(1).max(200),
  active: z.boolean(),
});
export const TeamPatch = TeamBody.extend({ version: z.number().int().min(1) });
export const MemberBody = z.strictObject({
  teamId: id,
  active: z.boolean(),
  isManager: z.boolean(),
  version: z.number().int().min(0),
  confirmImpact: z.boolean().default(false),
});
const AuditFields = z.object({
  id,
  version: z.number(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdById: id,
  updatedById: id,
});
export const TeamSchema = AuditFields.extend({
  name: z.string(),
  active: z.boolean(),
});
export const MemberSchema = AuditFields.extend({
  userId: id,
  teamId: id,
  active: z.boolean(),
  isManager: z.boolean(),
});
export const MemberDetail = z.object({
  member: MemberSchema.nullable(),
  affectedCustomers: z.number(),
  inconsistent: z.boolean(),
});
