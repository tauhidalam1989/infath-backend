import { Request, Response } from 'express';
import * as usersService from '../services/users.service';
import { logUserCreated, logUserUpdated, logUserDeleted, logError } from '../utils/logger.util';

/**
 * GET /api/users
 * Get all users with permissions
 */
export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await usersService.getUsers();
    res.json(users);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to get users'
    });
  }
};

/**
 * GET /api/users/:id
 * Get user by ID
 */
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await usersService.getUserById(parseInt(id));
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    
    res.json(user);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to get user'
    });
  }
};

/**
 * POST /api/users
 * Create a new user with permissions
 */
export const createUser = async (req: Request, res: Response) => {
  try {
    const {
      username,
      email,
      password,
      phone1,
      phone2,
      subsiteId,
      sectionId,
      specialDivisionId,
      userType,
      validity,
      notes,
      isActive,
      permissions
    } = req.body;

    if (!username || !email || !password || !phone1 || !userType || !validity || !permissions) {
      return res.status(400).json({
        error: 'username, email, password, phone1, userType, validity, and permissions are required'
      });
    }

    const user = await usersService.createUser(
      username,
      email,
      password,
      phone1,
      phone2,
      subsiteId,
      sectionId,
      specialDivisionId,
      userType,
      validity,
      notes,
      isActive !== undefined ? isActive : true,
      permissions
    );

    // Log user creation
    await logUserCreated(username, (req as any).user?.id, req);

    res.status(201).json(user);
  } catch (error: any) {
    if (error.message.includes('already exists') || error.message.includes('unique')) {
      return res.status(409).json({
        error: error.message || 'Username or email already exists'
      });
    }
    res.status(500).json({
      error: error.message || 'Failed to create user'
    });
  }
};

/**
 * PUT /api/users/:id
 * Update a user and their permissions
 */
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      username,
      email,
      password,
      phone1,
      phone2,
      subsiteId,
      sectionId,
      specialDivisionId,
      userType,
      validity,
      notes,
      isActive,
      permissions
    } = req.body;

    if (!username || !email || !phone1 || !userType || !validity || !permissions) {
      return res.status(400).json({
        error: 'username, email, phone1, userType, validity, and permissions are required'
      });
    }

    const user = await usersService.updateUser(
      parseInt(id),
      username,
      email,
      password, // Optional - only update if provided
      phone1,
      phone2,
      subsiteId,
      sectionId,
      specialDivisionId,
      userType,
      validity,
      notes,
      isActive !== undefined ? isActive : true,
      permissions
    );

    // Log user update
    await logUserUpdated(parseInt(id), username, (req as any).user?.id, req);

    res.json(user);
  } catch (error: any) {
    if (error.message === 'User not found' || error.message === 'Failed to retrieve updated user') {
      return res.status(404).json({
        error: error.message
      });
    }
    if (error.message.includes('already exists') || error.message.includes('unique')) {
      return res.status(409).json({
        error: error.message || 'Username or email already exists'
      });
    }
    res.status(500).json({
      error: error.message || 'Failed to update user'
    });
  }
};

/**
 * DELETE /api/users/:id
 * Delete a user
 */
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    
    // Get user info before deletion for logging
    const user = await usersService.getUserById(userId);
    const username = user?.username || 'Unknown';
    
    await usersService.deleteUser(userId);
    
    // Log user deletion
    await logUserDeleted(userId, username, (req as any).user?.id, req);
    
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    if (error.message === 'User not found') {
      return res.status(404).json({
        error: error.message
      });
    }
    res.status(500).json({
      error: error.message || 'Failed to delete user'
    });
  }
};

