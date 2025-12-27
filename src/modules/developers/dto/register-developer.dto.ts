import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDeveloperDto {
  @IsNotEmpty()
  @IsString()
  fullName!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  password!: string;
}
