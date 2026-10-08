-- ERP core schema

CREATE TABLE IF NOT EXISTS vendors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150),
  phone VARCHAR(50),
  address VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  vendor_id INT,
  reorder_level INT NOT NULL DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  INDEX idx_products_name (name),
  INDEX idx_products_category (category)
);

CREATE TABLE IF NOT EXISTS inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL UNIQUE,
  quantity INT NOT NULL DEFAULT 0,
  warehouse VARCHAR(100) DEFAULT 'main',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  change_qty INT NOT NULL,
  reason VARCHAR(150),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_movements_product (product_id, created_at)
);

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150),
  phone VARCHAR(50),
  address VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customers_name (name)
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT,
  status ENUM('pending','processing','shipped','completed','cancelled') NOT NULL DEFAULT 'pending',
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  INDEX idx_orders_status (status),
  INDEX idx_orders_date (order_date)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- A sale is money actually taken against an order. An order can sit unpaid;
-- a sale row only exists once payment is recorded.
CREATE TABLE IF NOT EXISTS sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT,
  customer_id INT,
  amount DECIMAL(10,2) NOT NULL,
  payment_method ENUM('cash','card','bank_transfer','credit') NOT NULL DEFAULT 'cash',
  note VARCHAR(255),
  sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  INDEX idx_sales_date (sale_date),
  UNIQUE KEY uq_sales_order (order_id)
);

-- ---------------------------------------------------------------------------
-- Seed data, so nothing is empty on first boot
-- ---------------------------------------------------------------------------

INSERT INTO vendors (id, name, email, phone, address) VALUES
  (1, 'Acme Supplies', 'sales@acmesupplies.com', '555-0101', '12 Foundry Rd'),
  (2, 'Northwind Traders', 'contact@northwind.com', '555-0102', '400 Harbour St'),
  (3, 'Kepler Components', 'hello@keplercomp.example', '555-0103', 'Unit 7, Dock Park')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO customers (id, name, email, phone, address) VALUES
  (1, 'Riverbend Cafe', 'orders@riverbend.example', '555-0201', '8 Mill Lane'),
  (2, 'TechPoint Retail', 'buying@techpoint.example', '555-0202', '55 High St'),
  (3, 'Halcyon Hotels', 'procurement@halcyon.example', '555-0203', '1 Esplanade')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO products (id, sku, name, description, category, price, cost, vendor_id, reorder_level) VALUES
  (1, 'WH-1000', 'Wireless Headphones', 'Over-ear, noise cancelling', 'Audio', 249.00, 142.00, 1, 15),
  (2, 'KB-220',  'Mechanical Keyboard', 'Tenkeyless, brown switches', 'Peripherals', 119.50, 64.00, 3, 20),
  (3, 'MS-055',  'Ergonomic Mouse', 'Vertical grip, six buttons', 'Peripherals', 68.00, 31.00, 3, 25),
  (4, 'CB-USB3', 'USB-C Cable 2m', 'Braided, 100W PD', 'Cables', 14.00, 4.20, 2, 100),
  (5, 'MN-27Q',  '27-inch QHD Monitor', '165Hz IPS panel', 'Displays', 389.00, 255.00, 1, 8),
  (6, 'DK-HUB7', '7-Port Docking Hub', 'HDMI, ethernet, SD', 'Peripherals', 92.00, 48.00, 2, 12)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO inventory (product_id, quantity, warehouse) VALUES
  (1, 42, 'main'), (2, 18, 'main'), (3, 7, 'main'),
  (4, 340, 'main'), (5, 4, 'main'), (6, 26, 'main')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity);
