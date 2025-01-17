import { UserRepository } from "./user-repository";


async function main() {
  const userRepo = new UserRepository();

  // Create
  const newUser = await userRepo.create({
    data: { email: 'test@example.com', name: 'Test User' },
  });

  // Find
  await userRepo.findUnique({ where: { id: newUser.id } });

  // Update
  await userRepo.update({
    where: { id: newUser.id },
    data: { name: 'Updated Name' },
  });

  // Delete
  await userRepo.delete({ where: { id: newUser.id } });
}

main();
