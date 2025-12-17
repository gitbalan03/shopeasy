// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const app = express();

// ======================
// Middleware
// ======================
app.use(express.json({ limit: "10mb" })); // Limit payload size
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

// Serve uploaded images
app.use("/uploads", express.static("uploads"));

// ======================
// MongoDB Connection
// ======================
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB connection error:", err));

// ======================
// Async Handler Helper
// ======================
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// ======================
// Order Schema & Model
// ======================
const orderSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, trim: true },
        address: { type: String, trim: true },
        payment: { type: String, default: "cod" },
        items: [
            {
                name: { type: String, required: true },
                quantity: { type: Number, default: 1, min: 1 },
                price: { type: Number, required: true, min: 0 },
                image: { type: String },
            },
        ],
        total: { type: Number, required: true, min: 0 },
        status: {
            type: String,
            enum: ["Pending", "Confirmed", "Shipped", "Delivered"],
            default: "Pending",
        },
    },
    { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);

// ======================
// Routes
// ======================

// Home
app.get("/", (req, res) => {
    res.send(`
    🚀 Server is running<br><br>
    🔗 <a href="/api/orders">View Orders JSON</a><br>
    🔗 <a href="/orders-table">View Orders Table</a>
  `);
});

// Create New Order
app.post(
    "/api/orders",
    asyncHandler(async (req, res) => {
        const { name, email, address, payment, items } = req.body;

        if (!name || !items || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Name and items are required",
            });
        }

        // Validate each item
        for (const item of items) {
            if (item.price < 0 || item.quantity < 1) {
                return res.status(400).json({
                    success: false,
                    message: "Item price must be >= 0 and quantity >= 1",
                });
            }
        }

        // Calculate total securely on backend
        const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

        const newOrder = new Order({
            name,
            email,
            address,
            payment,
            items,
            total,
        });

        await newOrder.save();

        res.status(201).json({
            success: true,
            message: "✅ Order saved successfully",
            order: newOrder,
        });
    })
);

// Fetch All Orders (JSON)
app.get(
    "/api/orders",
    asyncHandler(async (req, res) => {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    })
);

// Fetch Single Order by ID
app.get(
    "/api/orders/:id",
    asyncHandler(async (req, res) => {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        res.json(order);
    })
);

// Update Order Status
app.patch(
    "/api/orders/:id/status",
    asyncHandler(async (req, res) => {
        const { status } = req.body;
        if (!["Pending", "Confirmed", "Shipped", "Delivered"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status" });
        }
        const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        res.json({ success: true, order });
    })
);

// Orders Table (HTML)
app.get(
    "/orders-table",
    asyncHandler(async (req, res) => {
        const orders = await Order.find().sort({ createdAt: -1 });

        let html = `
    <html>
    <head>
      <title>Orders Table</title>
      <style>
        body { font-family: Arial; background: #f4f4f4; padding: 20px; }
        table { width: 100%; border-collapse: collapse; background: #fff; }
        th, td { border: 1px solid #ccc; padding: 10px; vertical-align: top; }
        th { background: #eee; }
        img { width: 60px; height: 60px; object-fit: cover; border-radius: 6px; }
        ul { padding-left: 18px; margin: 0; }
      </style>
    </head>
    <body>
      <h2>📦 Orders Table</h2>
      <table>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Address</th>
          <th>Payment</th>
          <th>Status</th>
          <th>Total</th>
          <th>Items</th>
          <th>Created</th>
        </tr>
    `;

        orders.forEach((order) => {
            html += `
      <tr>
        <td>${order.name}</td>
        <td>${order.email || "-"}</td>
        <td>${order.address || "-"}</td>
        <td>${order.payment}</td>
        <td>${order.status}</td>
        <td>₹${order.total.toFixed(2)}</td>
        <td>
          <ul>
            ${order.items
                    .map(
                        (item) => `
                <li>
                  ${item.image
                                ? `<img src="${item.image.startsWith("http") ? item.image : "/uploads/" + item.image}">`
                                : ""
                            }
                  ${item.name} (x${item.quantity}) – ₹${item.price}
                </li>
              `
                    )
                    .join("")}
          </ul>
        </td>
        <td>${new Date(order.createdAt).toLocaleString()}</td>
      </tr>
      `;
        });

        html += `
      </table>
    </body>
    </html>
    `;

        res.send(html);
    })
);

// ======================
// Global Error Handler
// ======================
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ success: false, message: "❌ Internal Server Error", error: err.message });
});

// ======================
// Start Server
// ======================
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
