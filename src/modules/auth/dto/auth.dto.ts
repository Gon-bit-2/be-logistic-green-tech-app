import { createZodDto } from 'nestjs-zod'
import {
  AddressBookListResSchema,
  AddressBookResSchema,
  CreateAddressBookBodySchema,
  ForgotPasswordBodySchema,
  GetAuthorizationUrlResSchema,
  GoogleSessionBodySchema,
  GoogleSessionResSchema,
  LoginBodySchema,
  LoginResSchema,
  LogoutBodySchema,
  RefreshTokenBodySchema,
  RefreshTokenResSchema,
  RegisterBodySchema,
  RegisterResSchema,
  SendOTPBodySchema,
  UpdateAddressBookBodySchema,
  UpdateProfileBodySchema,
  UpdateProfileResSchema,
  VerifyOTPBodySchema,
} from 'src/modules/auth/model/auth.model'
//Serializer

export class RegisterBodyDTO extends createZodDto(RegisterBodySchema) {}
export class RegisterResDTO extends createZodDto(RegisterResSchema) {}
export class SendOPTBodyDTO extends createZodDto(SendOTPBodySchema) {}
export class VerifyOTPBodyDTO extends createZodDto(VerifyOTPBodySchema) {}
export class LoginBodyDTO extends createZodDto(LoginBodySchema) {}
export class LoginResDTO extends createZodDto(LoginResSchema) {}
export class RefreshTokenBodyDTO extends createZodDto(RefreshTokenBodySchema) {}
export class RefreshTokenResDTO extends createZodDto(RefreshTokenResSchema) {}
export class LogoutBodyDTO extends createZodDto(LogoutBodySchema) {}
export class GetAuthorizationUrlResDTO extends createZodDto(GetAuthorizationUrlResSchema) {}
export class GoogleSessionBodyDTO extends createZodDto(GoogleSessionBodySchema) {}
export class GoogleSessionResDTO extends createZodDto(GoogleSessionResSchema) {}
export class ForgotPasswordBodyDTO extends createZodDto(ForgotPasswordBodySchema) {}
export class UpdateProfileBodyDTO extends createZodDto(UpdateProfileBodySchema) {}
export class UpdateProfileResDTO extends createZodDto(UpdateProfileResSchema) {}
export class CreateAddressBookBodyDTO extends createZodDto(CreateAddressBookBodySchema) {}
export class UpdateAddressBookBodyDTO extends createZodDto(UpdateAddressBookBodySchema) {}
export class AddressBookResDTO extends createZodDto(AddressBookResSchema) {}
export class AddressBookListResDTO extends createZodDto(AddressBookListResSchema) {}
