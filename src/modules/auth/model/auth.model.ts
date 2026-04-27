import { TypeOfVerificationCode } from 'src/common/constants/auth.constant'
import z from 'zod'
import { PermissionSchema, RoleSchema } from 'src/modules/role/model/role.model'

export const UserSchema = z.object({
  id: z.number(),
  email: z.string().email().nonempty(),
  password: z.string().min(6).max(100).nonempty(),
  fullName: z.string().min(1).max(100).nonempty(),
  phone: z.string().min(10).max(15).or(z.null()),
  avatar: z.string().nullable(),
  totpSecret: z.string().nullable(),
  isDeleted: z.boolean().default(false),
  roleId: z.number().positive(),
  hubId: z.number().positive().nullable(),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type UserType = z.infer<typeof UserSchema>
export const RegisterBodySchema = UserSchema.pick({
  email: true,
  password: true,
  fullName: true,
  phone: true,
})
  .extend({
    confirmPassword: z.string().min(6).max(100).nonempty(),
    code: z.string().length(6),
  })
  .strict()
  .superRefine(({ confirmPassword, password }, ctx) => {
    if (confirmPassword !== password) {
      ctx.addIssue({
        code: 'custom',
        message: 'Password anh Confirm Password must match',
        path: ['confirmPassword'],
      })
    }
  })
export type RegisterBodyType = z.infer<typeof RegisterBodySchema>
//
export const RegisterResSchema = UserSchema.omit({
  password: true,
  totpSecret: true,
})
export type RegisterResType = z.infer<typeof RegisterResSchema>

//
export const VerificationCode = z.object({
  id: z.number(),
  email: z.string().email(),
  code: z.string().length(6),
  type: z.enum([TypeOfVerificationCode.REGISTER, TypeOfVerificationCode.FORGOT_PASSWORD, TypeOfVerificationCode.LOGIN]),
  expiresAt: z.date(),
  createdAt: z.date(),
})
export type VerificationCodeType = z.infer<typeof VerificationCode>
//
export const SendOTPBodySchema = VerificationCode.pick({
  email: true,
  type: true,
}).strict()

export type SendOTPBodyType = z.infer<typeof SendOTPBodySchema>

export const VerifyOTPBodySchema = VerificationCode.pick({
  email: true,
  code: true,
  type: true,
}).strict()
export type VerifyOTPBodyType = z.infer<typeof VerifyOTPBodySchema>
// login
export const LoginBodySchema = UserSchema.pick({
  email: true,
  password: true,
})
  .extend({
    code: z.string().length(6).optional(), //otp code email
  })
  .strict()

export type LoginBodyType = z.infer<typeof LoginBodySchema>

export const LoginResSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
})
export type LoginResType = z.infer<typeof LoginResSchema>
//refresh token
export const RefreshTokenSchema = z.object({
  token: z.string(),
  userId: z.number(),
  deviceId: z.number(),
  expiresAt: z.date(),
  createdAt: z.date(),
})
export type RefreshTokenType = z.infer<typeof RefreshTokenSchema>
export const RefreshTokenBodySchema = z
  .object({
    refreshToken: z.string(),
  })
  .strict()
export type RefreshTokenBodyType = z.infer<typeof RefreshTokenBodySchema>

export const RefreshTokenResSchema = LoginResSchema
export type RefreshTokenResType = LoginResType
//Device
export const DeviceSchema = z.object({
  id: z.number(),
  userId: z.number(),
  userAgent: z.string(),
  ip: z.string(),
  lastActive: z.date(),
  createdAt: z.date(),
  isActive: z.boolean().optional(),
})
export type DeviceType = z.infer<typeof DeviceSchema>
export const GetUsserProfileResSchema = UserSchema.omit({
  password: true,
  totpSecret: true,
}).extend({
  isTwoFactorEnabled: z.boolean(),
  role: RoleSchema.pick({
    id: true,
    name: true,
  }).extend({
    permissions: z.array(
      PermissionSchema.pick({
        id: true,
        name: true,
        module: true,
        path: true,
        method: true,
      }),
    ),
  }),
})
//logout
export const LogoutBodySchema = RefreshTokenBodySchema
export type LogoutBodyType = RefreshTokenBodyType
//oauth2
export const GoogleAuthStateSchema = DeviceSchema.pick({
  userAgent: true,
  ip: true,
})
export type GoogleAuthStateType = z.infer<typeof GoogleAuthStateSchema>
export const GetAuthorizationUrlResSchema = z.object({
  url: z.string().url(),
})
export type GetAuthorizationUrlResType = z.infer<typeof GetAuthorizationUrlResSchema>

export const GoogleSessionBodySchema = z
  .object({
    sessionToken: z.string().uuid(),
  })
  .strict()
export type GoogleSessionBodyType = z.infer<typeof GoogleSessionBodySchema>

export const GoogleSessionResSchema = LoginResSchema
export type GoogleSessionResType = z.infer<typeof GoogleSessionResSchema>

//forgot password
export const ForgotPasswordBodySchema = z
  .object({
    email: z.string().email(),
    code: z.string().length(6),
    newPassword: z.string().min(6).max(100).nonempty(),
    confirmNewPassword: z.string().min(6).max(100).nonempty(),
  })
  .strict()
  .superRefine(({ confirmNewPassword, newPassword }, ctx) => {
    if (confirmNewPassword !== newPassword) {
      ctx.addIssue({
        code: 'custom',
        message: 'Mật khẩu không khớp',
        path: ['confirmNewPassword'],
      })
    }
  })
export type ForgotPasswordBodyType = z.infer<typeof ForgotPasswordBodySchema>

export const UpdateProfileBodySchema = UserSchema.pick({
  fullName: true,
  phone: true,
  avatar: true,
})
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Vui lòng cung cấp ít nhất một trường để cập nhật',
  })
export type UpdateProfileBodyType = z.infer<typeof UpdateProfileBodySchema>

export const UpdateProfileResSchema = RegisterResSchema
export type UpdateProfileResType = z.infer<typeof UpdateProfileResSchema>

export const AddressBookSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  label: z.string().min(1).max(100).nullable(),
  contactName: z.string().min(1).max(255),
  phone: z.string().min(10).max(20),
  address: z.string().min(1).max(500),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  isDefault: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
})

export const CreateAddressBookBodySchema = AddressBookSchema.pick({
  label: true,
  contactName: true,
  phone: true,
  address: true,
  latitude: true,
  longitude: true,
  isDefault: true,
})
  .extend({
    label: z.string().min(1).max(100).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    isDefault: z.boolean().optional(),
  })
  .strict()
export type CreateAddressBookBodyType = z.infer<typeof CreateAddressBookBodySchema>

export const UpdateAddressBookBodySchema = CreateAddressBookBodySchema.partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Vui lòng cung cấp ít nhất một trường để cập nhật',
  })
export type UpdateAddressBookBodyType = z.infer<typeof UpdateAddressBookBodySchema>

export const AddressBookResSchema = AddressBookSchema
export type AddressBookResType = z.infer<typeof AddressBookResSchema>

export const AddressBookListResSchema = z.object({
  data: z.array(AddressBookSchema),
})
export type AddressBookListResType = z.infer<typeof AddressBookListResSchema>
