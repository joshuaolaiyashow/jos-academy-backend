import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    example: 'jane@example.com',
    description: "The account's email, typed to confirm deletion",
  })
  @IsEmail()
  confirmEmail: string;
}
