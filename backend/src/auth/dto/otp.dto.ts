import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OmitType } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';
import { FarmerSelfRegisterDto } from './auth.dto';

const PHONE = /^\+?[0-9\s-]{9,16}$/;

export class RequestOtpDto {
  @ApiProperty({ example: '0768680433' })
  @IsString()
  @Matches(PHONE, { message: 'Enter a valid phone number' })
  phone: string;

  @ApiPropertyOptional({
    enum: ['login', 'register'],
    description: 'What the person chose: "login" needs an existing account, "register" needs a number with none. Omit for the old combined flow.',
  })
  @IsOptional()
  @IsIn(['login', 'register'])
  intent?: 'login' | 'register';
}

export class VerifyOtpDto extends RequestOtpDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  @Matches(/^[0-9]{6}$/, { message: 'The code is 6 digits' })
  code: string;
}

/** The sign-up form shown after a new number is verified. No password: the phone is the credential. */
export class OtpRegisterDto extends OmitType(FarmerSelfRegisterDto, ['password'] as const) {
  @ApiProperty({ description: 'Returned by /auth/otp/verify for a number with no account' })
  @IsString()
  @IsNotEmpty()
  registrationToken: string;
}
