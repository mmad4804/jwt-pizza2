import { Page } from '@playwright/test';
import { test, expect } from '../testSetup';
import { Role, User } from '../src/service/pizzaService';

async function basicInit(page: Page) {
  let loggedInUser: User | undefined;
  const validUsers: Record<string, User> = { 'd@jwt.com': { id: '3', name: 'Kai Chen', email: 'd@jwt.com', password: 'a', roles: [{ role: Role.Diner }] } };

  await page.route('*/**/api/auth', async (route) => {
    const loginReq = route.request().postDataJSON();
    const user = validUsers[loginReq.email];
    if (!user || user.password !== loginReq.password) {
      await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
      return;
    }
    loggedInUser = validUsers[loginReq.email];
    const loginRes = {
      user: loggedInUser,
      token: 'abcdef',
    };
    expect(route.request().method()).toBe('PUT');
    await route.fulfill({ json: loginRes });
  });

  await page.route('*/**/api/user/me', async (route) => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: loggedInUser });
  });

  await page.route('*/**/api/order/menu', async (route) => {
    const menuRes = [
      { id: 1, title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' },
      { id: 2, title: 'Pepperoni', image: 'pizza2.png', price: 0.0042, description: 'Spicy treat' },
    ];
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: menuRes });
  });

  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    const franchiseRes = {
      franchises: [
        {
          id: 2,
          name: 'LotaPizza',
          stores: [
            { id: 4, name: 'Lehi' },
            { id: 5, name: 'Springville' },
            { id: 6, name: 'American Fork' },
          ],
        },
        { id: 3, name: 'PizzaCorp', stores: [{ id: 7, name: 'Spanish Fork' }] },
        { id: 4, name: 'topSpot', stores: [] },
      ],
    };
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: franchiseRes });
  });

  await page.route('*/**/api/order', async (route) => {
    const orderReq = route.request().postDataJSON();
    const orderRes = {
      order: { ...orderReq, id: 23 },
      jwt: 'eyJpYXQ',
    };
    expect(route.request().method()).toBe('POST');
    await route.fulfill({ json: orderRes });
  });

  await page.goto('/');
}

const adminUser: User = { id: '1', name: 'Ada Admin', email: 'admin@jwt.com', roles: [{ role: Role.Admin }] };
const franchisee: User = { id: '2', name: 'Fran Owner', email: 'fran@jwt.com', roles: [{ role: Role.Franchisee, objectId: '2' }] };
const testFranchise = {
  id: '2', name: 'LotaPizza', admins: [{ id: '2', name: 'Fran Owner', email: 'fran@jwt.com' }],
  stores: [{ id: '4', name: 'Lehi', totalRevenue: 12.5 }, { id: '5', name: 'Springville', totalRevenue: 8 }],
};

async function initAs(page: Page, user: User, path: string) {
  await page.addInitScript(() => localStorage.setItem('token', 'mock-token'));
  await page.route('**/api/user/me', async (route) => route.fulfill({ json: user }));
  await page.route('**/api/order/menu', async (route) => route.fulfill({ json: [
    { id: '1', title: 'Veggie', image: 'pizza1.png', price: 3.8, description: 'A garden of delight' },
  ] }));
  await page.route(/\/api\/franchise(?:\/[^?]*)?(?:\?.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname.endsWith('/api/franchise')) {
      await route.fulfill({ json: { franchises: [testFranchise], more: true } });
    } else if (request.method() === 'GET') {
      await route.fulfill({ json: [testFranchise] });
    } else if (request.method() === 'POST' && url.pathname.endsWith('/store')) {
      await route.fulfill({ json: { id: '8', name: request.postDataJSON().name } });
    } else if (request.method() === 'POST') {
      await route.fulfill({ json: { ...request.postDataJSON(), id: '9' } });
    } else {
      await route.fulfill({ json: null });
    }
  });
  await page.route('**/api/order', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { orders: [{ id: '23', date: '2026-10-01', items: [{ menuId: '1', description: 'Veggie', price: 3.8 }] }] } });
    } else {
      await route.fulfill({ json: { order: { id: '23', ...route.request().postDataJSON() }, jwt: 'mock-jwt' } });
    }
  });
  await page.route('**/api/auth', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ json: { user: { ...route.request().postDataJSON(), id: '6', roles: [{ role: Role.Diner }] }, token: 'registered' } });
    } else {
      await route.fulfill({ status: 200, json: {} });
    }
  });
  await page.route('**/api/docs', async (route) => route.fulfill({ json: { endpoints: [
    { requiresAuth: true, method: 'GET', path: '/api/example', description: 'Example endpoint', example: '{}', response: { ok: true } },
  ] } }));
  await page.route('https://pizza-factory.cs329.click/api/docs', async (route) => route.fulfill({ json: { endpoints: [
    { requiresAuth: false, method: 'POST', path: '/api/order/verify', description: 'Verify pizza', example: '{ jwt }', response: { message: 'valid' } },
  ] } }));
  await page.route('**/api/order/verify', async (route) => route.fulfill({ json: { message: 'valid', payload: { orderId: '23' } } }));
  await page.goto(path);
}

test('login', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('d@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('link', { name: 'KC' })).toBeVisible();
});

test('purchase with login', async ({ page }) => {
  await basicInit(page);

  await page.getByRole('button', { name: 'Order now' }).click();

  await expect(page.locator('h2')).toContainText('Awesome is a click away');
  await page.getByRole('combobox').selectOption('4');
  await page.getByRole('link', { name: 'Image Description Veggie A' }).click();
  await page.getByRole('link', { name: 'Image Description Pepperoni' }).click();
  await expect(page.locator('form')).toContainText('Selected pizzas: 2');
  await page.getByRole('button', { name: 'Checkout' }).click();

  await page.getByPlaceholder('Email address').fill('d@jwt.com');
  await page.getByPlaceholder('Password').fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('main')).toContainText('Send me those 2 pizzas right now!');
  await expect(page.locator('tbody')).toContainText('Veggie');
  await expect(page.locator('tbody')).toContainText('Pepperoni');
  await expect(page.locator('tfoot')).toContainText('0.008 ₿');
  await page.getByRole('button', { name: 'Pay now' }).click();

  await expect(page.getByText('0.008')).toBeVisible();
});

test('registers a diner', async ({ page }) => {
  await basicInit(page);
  await page.route('**/api/auth', async (route) => route.fulfill({ json: { user: { id: '6', name: 'Pat Pizza', roles: [{ role: Role.Diner }] }, token: 'registered' } }));
  await page.getByRole('link', { name: 'Register' }).click();
  await page.getByPlaceholder('Full name').fill('Pat Pizza');
  await page.getByPlaceholder('Email address').fill('pat@jwt.com');
  await page.getByPlaceholder('Password').fill('secret');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByRole('link', { name: 'PP' })).toBeVisible();
});

test('admin can filter and page through franchises and open creation and close screens', async ({ page }) => {
  await initAs(page, adminUser, '/admin-dashboard');
  await expect(page.getByRole('heading', { name: "Mama Ricci's kitchen" })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'LotaPizza' })).toBeVisible();
  await page.getByPlaceholder('Filter franchises').fill('Lota');
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByRole('button', { name: '»' }).click();
  await page.getByRole('button', { name: 'Add Franchise' }).click();
  await page.getByPlaceholder('franchise name').fill('New Pizza');
  await page.getByPlaceholder('franchisee admin email').fill('owner@jwt.com');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/admin-dashboard$/);
  await page.getByRole('button', { name: 'Close' }).first().click();
  await expect(page.getByText(/close the LotaPizza franchise/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
});

test('franchisee manages stores and diner sees order history', async ({ page }) => {
  await initAs(page, franchisee, '/franchise-dashboard');
  await expect(page.getByRole('heading', { name: 'LotaPizza' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Lehi' })).toBeVisible();
  await page.getByRole('button', { name: 'Create store' }).click();
  await page.getByPlaceholder('store name').fill('Provo');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/franchise-dashboard$/);
  await page.getByRole('button', { name: 'Close' }).first().click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.goto('/diner-dashboard');
  await expect(page.getByRole('heading', { name: 'Your pizza kitchen' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '23' })).toBeVisible();
});

test('diner with no order history can start an order', async ({ page }) => {
  await initAs(page, { ...franchisee, roles: [{ role: Role.Diner }] }, '/diner-dashboard');
  await page.route('**/api/order', async (route) => route.fulfill({ json: { orders: [] } }));
  await expect(page.getByText(/without having a pizza/)).toBeVisible();
  await page.getByRole('link', { name: 'Buy one' }).click();
  await expect(page.getByRole('heading', { name: 'Awesome is a click away' })).toBeVisible();
});

test('delivery verifies an order and can start another', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('token', 'mock-token'));
  await page.route('**/api/user/me', async (route) => route.fulfill({ json: adminUser }));
  await page.route('**/api/order/menu', async (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/franchise\?.*$/, async (route) => route.fulfill({ json: { franchises: [], more: false } }));
  await page.route('**/api/order/verify', async (route) => route.fulfill({ json: { message: 'valid', payload: { orderId: '23' } } }));
  await page.goto('/delivery', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Order more' }).click();
  await expect(page).toHaveURL(/menu$/);
  await page.goto('/delivery');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { name: /JWT Pizza - valid/ })).toBeVisible();
  await expect(page.locator('pre')).toContainText('orderId');
});

test('renders informational pages, docs and not found route', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'About' }).click();
  await expect(page.getByRole('heading', { name: 'The secret sauce' })).toBeVisible();
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: 'Mama Rucci, my my' })).toBeVisible();
  await page.route('**/api/docs', async (route) => route.fulfill({ json: { endpoints: [
    { requiresAuth: true, method: 'GET', path: '/api/example', description: 'Example endpoint', example: '{}', response: { ok: true } },
  ] } }));
  await page.route('https://pizza-factory.cs329.click/api/docs', async (route) => route.fulfill({ json: { endpoints: [
    { requiresAuth: false, method: 'POST', path: '/api/order/verify', description: 'Verify pizza', example: '{ jwt }', response: { message: 'valid' } },
  ] } }));
  await page.goto('/docs/service');
  await expect(page.getByText('Example endpoint')).toBeVisible();
  await page.goto('/docs/factory');
  await expect(page.getByText('Verify pizza')).toBeVisible();
  await page.goto('/unknown-route');
  await expect(page.getByRole('heading', { name: 'Oops' })).toBeVisible();
});

test('logout clears the session', async ({ page }) => {
  await initAs(page, adminUser, '/');
  await page.getByRole('link', { name: 'Logout' }).click();
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
});
