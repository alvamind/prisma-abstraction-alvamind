// // test-prisma-abstraction-alvamind/src/user-controller.ts

// import { UserRepository } from './user-repository';

// export class UserController extends UserRepository {

//   async createUser(email: string, name: string) {
//     return await this.create({
//       data: { email, name }
//     });
//   }

//   async findUserById(id: number) {
//     const abc = await this.withCache({ cache: true, ttl: 20 }).findUnique({
//       where: { id: "sadas" }, select: { id: true, email: true }
//     });

//     return abc
//   }

//   async updateUserName(id: number, name: string) {
//     return await this.update({
//       where: { id },
//       data: { name }
//     });
//   }

//   async deleteUser(id: number) {
//     return await this.delete({
//       where: { id }
//     });
//   }

//   // Example usage method
//   async handleUserOperations() {
//     // Create new user
//     const newUser = await this.createUser('test@example.com', 'Test User');

//     // Find user
//     const foundUser = await this.findUserById(newUser.id);
//     console.log(foundUser?.status);

//     // Update user
//     const updatedUser = await this.updateUserName(newUser.id, 'Updated Name');

//     // Delete user
//     await this.deleteUser(newUser.id);
//   }
// }

// // Usage
// const userController = new UserController();
// userController.handleUserOperations();
