/**
 * Domain record schemas (zod). One source of truth: the same schemas validate
 * storage-domain records and give TS types via `z.infer`.
 */
import { z } from 'zod';
export declare const ProjectRecord: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
    workspacePath: z.ZodString;
    managed: z.ZodOptional<z.ZodBoolean>;
    createdAt: z.ZodNumber;
}, z.core.$strip>;
export type ProjectRecord = z.infer<typeof ProjectRecord>;
export declare const UserRecord: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
    projectSlug: z.ZodNullable<z.ZodString>;
    role: z.ZodEnum<{
        admin: "admin";
        user: "user";
    }>;
    passwordHash: z.ZodString;
    status: z.ZodEnum<{
        active: "active";
        disabled: "disabled";
    }>;
    workspacePath: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodNumber;
}, z.core.$strip>;
export type UserRecord = z.infer<typeof UserRecord>;
export declare const TokenRecord: z.ZodObject<{
    fingerprint: z.ZodString;
    userSlug: z.ZodString;
    createdAt: z.ZodNumber;
    expiresAt: z.ZodNumber;
    revoked: z.ZodBoolean;
}, z.core.$strip>;
export type TokenRecord = z.infer<typeof TokenRecord>;
export declare const RoleRecord: z.ZodObject<{
    code: z.ZodEnum<{
        admin: "admin";
        user: "user";
    }>;
    description: z.ZodString;
}, z.core.$strip>;
export type RoleRecord = z.infer<typeof RoleRecord>;
/** The zod table layout handed to `defineDomain` when storageDomain exists. */
export declare const projectsDomainTables: {
    projects: z.ZodObject<{
        slug: z.ZodString;
        name: z.ZodString;
        workspacePath: z.ZodString;
        managed: z.ZodOptional<z.ZodBoolean>;
        createdAt: z.ZodNumber;
    }, z.core.$strip>;
    users: z.ZodObject<{
        slug: z.ZodString;
        name: z.ZodString;
        projectSlug: z.ZodNullable<z.ZodString>;
        role: z.ZodEnum<{
            admin: "admin";
            user: "user";
        }>;
        passwordHash: z.ZodString;
        status: z.ZodEnum<{
            active: "active";
            disabled: "disabled";
        }>;
        workspacePath: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodNumber;
    }, z.core.$strip>;
    tokens: z.ZodObject<{
        fingerprint: z.ZodString;
        userSlug: z.ZodString;
        createdAt: z.ZodNumber;
        expiresAt: z.ZodNumber;
        revoked: z.ZodBoolean;
    }, z.core.$strip>;
    roles: z.ZodObject<{
        code: z.ZodEnum<{
            admin: "admin";
            user: "user";
        }>;
        description: z.ZodString;
    }, z.core.$strip>;
};
