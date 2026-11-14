import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

const nameErrors = async (name: string): Promise<string[]> => {
  const dto = plainToInstance(RegisterDto, {
    email: 'user@example.com',
    password: 'Password123',
    name,
  });
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'name').map((e) => e.property);
};

describe('RegisterDto name', () => {
  it.each(['12345 67890', 'John3 Doe', '12345', 'John 67890', '- -'])(
    'rejects %p',
    async (name) => {
      expect(await nameErrors(name)).toEqual(['name']);
    },
  );

  it.each([
    'John Doe',
    'Mary-Jane O’Brien',
    "D'Angelo Smith",
    'J. R. Tolkien',
    'Chiamaka Ọkọnkwọ',
    'Zoë Müller Jr.',
  ])('accepts %p', async (name) => {
    expect(await nameErrors(name)).toEqual([]);
  });
});
