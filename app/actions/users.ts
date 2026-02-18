'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { hashApprovalPin } from '@/lib/security/pin';
import { withBusinessContext, formAction, err } from '@/lib/action-utils';
import { formString, formOptionalString } from '@/lib/form-helpers';

export async function createUserAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user: owner, businessId } = await withBusinessContext(['OWNER']);

    const name = formString(formData, 'name');
    const email = formString(formData, 'email').toLowerCase();
    const password = String(formData.get('password') || '');
    const approvalPin = formString(formData, 'approvalPin');
    const role = formString(formData, 'role') || 'CASHIER';

    if (!name || !email || !password) return err('Name, email, and password are required.');
    if (password.length < 6) return err('Password must be at least 6 characters.');

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return err('A user with that email already exists.');

    const passwordHash = await bcrypt.hash(password, 10);
    const approvalPinHash = approvalPin ? await hashApprovalPin(approvalPin) : null;

    const created = await prisma.user.create({
      data: { businessId, name, email, passwordHash, approvalPinHash, role, active: true },
      select: { id: true },
    });

    await audit({ businessId, userId: owner.id, userName: owner.name, userRole: owner.role, action: 'USER_CREATE', entity: 'User', entityId: created.id, details: { name, email, role } });

    redirect('/users?success=created');
  }, '/users');
}

export async function updateUserAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user: owner, businessId } = await withBusinessContext(['OWNER']);

    const userId = formString(formData, 'userId');
    const name = formString(formData, 'name');
    const email = formString(formData, 'email').toLowerCase();
    const role = formString(formData, 'role') || 'CASHIER';
    const active = formData.get('active') === 'on';
    const newPassword = String(formData.get('newPassword') || '');
    const newApprovalPin = formString(formData, 'newApprovalPin');

    if (!userId || !name || !email) return err('User ID, name, and email are required.');

    const targetUser = await prisma.user.findFirst({
      where: { id: userId, businessId },
      select: { id: true },
    });
    if (!targetUser) return err('User not found. They may have been removed.');

    const duplicate = await prisma.user.findFirst({
      where: { email, NOT: { id: targetUser.id } },
      select: { id: true },
    });
    if (duplicate) return err('A user with that email already exists.');

    const data: Record<string, unknown> = { name, email, role, active };

    if (newPassword) {
      if (newPassword.length < 6) return err('Password must be at least 6 characters.');
      data.passwordHash = await bcrypt.hash(newPassword, 10);
    }
    if (newApprovalPin) {
      data.approvalPinHash = await hashApprovalPin(newApprovalPin);
    }

    await prisma.user.update({ where: { id: targetUser.id }, data });

    // Invalidate all sessions when password is changed or user is deactivated
    if (newPassword || !active) {
      await prisma.session.deleteMany({ where: { userId: targetUser.id } });
    }

    await audit({ businessId, userId: owner.id, userName: owner.name, userRole: owner.role, action: 'USER_UPDATE', entity: 'User', entityId: targetUser.id, details: { name, email, role, active } });

    redirect('/users?success=updated');
  }, '/users');
}

export async function toggleUserActiveAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user: owner, businessId } = await withBusinessContext(['OWNER']);

    const userId = formString(formData, 'userId');

    const target = await prisma.user.findFirst({
      where: { id: userId, businessId },
      select: { id: true, name: true, active: true },
    });
    if (!target) return err('User not found.');
    if (target.id === owner.id) return err('You cannot deactivate your own account.');

    const nowActive = !target.active;
    await prisma.user.update({ where: { id: target.id }, data: { active: nowActive } });

    if (!nowActive) {
      await prisma.session.deleteMany({ where: { userId: target.id } });
    }

    await audit({ businessId, userId: owner.id, userName: owner.name, userRole: owner.role, action: nowActive ? 'USER_UPDATE' : 'USER_DEACTIVATE', entity: 'User', entityId: target.id, details: { name: target.name, active: nowActive } });

    redirect('/users');
  }, '/users');
}

