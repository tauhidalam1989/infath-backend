import { Router } from 'express';
import * as usersController from '../controllers/users.controller';

const router = Router();

// Get all users
router.get('/', usersController.getUsers);

// Get user by ID
router.get('/:id', usersController.getUserById);

// Create new user
router.post('/', usersController.createUser);

// Update user
router.put('/:id', usersController.updateUser);

// Delete user
router.delete('/:id', usersController.deleteUser);

export default router;

