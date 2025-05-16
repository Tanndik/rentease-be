import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Get all cars
export const getAllCars = async (req, res) => {
  try {
    const { brand, available } = req.query;

    // Build filter
    const filter = {};

    if (brand) {
      filter.brand = brand;
    }

    if (available === "true") {
      filter.isAvailable = true;
    }

    const cars = await prisma.car.findMany({
      where: filter,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json(cars);
  } catch (error) {
    console.error("Get all cars error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/// Get cars for the authenticated user
export const getMyCars = async (req, res) => {
  try {
    // req.user comes from the auth middleware
    const userId = req.user.id;

    const cars = await prisma.car.findMany({
      where: { ownerId: userId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json(cars);
  } catch (error) {
    console.error("Get my cars error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get car by ID
export const getCarById = async (req, res) => {
  try {
    const { id } = req.params;

    const car = await prisma.car.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
    });

    if (!car) {
      return res.status(404).json({ message: "Car not found" });
    }

    res.status(200).json(car);
  } catch (error) {
    console.error("Get car by ID error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Create car
export const createCar = async (req, res) => {
  try {
    // Log everything
    console.log("CREATE CAR - Full Request Details:");
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);
    console.log("User:", req.user);

    const { name, brand, model, year, licensePlate, price, description } =
      req.body;

    // Validate each field explicitly
    const errors = {};
    if (!name) errors.name = "Name is required";
    if (!brand) errors.brand = "Brand is required";
    if (!model) errors.model = "Model is required";
    if (!year) errors.year = "Year is required";
    if (!licensePlate) errors.licensePlate = "License Plate is required";
    if (!price) errors.price = "Price is required";

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        message: "Validation failed",
        errors,
      });
    }

    // Rest of the create car logic remains the same
    const car = await prisma.car.create({
      data: {
        name,
        brand,
        model,
        year: Number(year),
        licensePlate,
        price: Number(price),
        description,
        ownerId: req.user.id,
        isAvailable: true,
      },
    });

    res.status(201).json({
      message: "Car created successfully",
      car,
    });
  } catch (error) {
    console.error("Create car error:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Update car
export const updateCar = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      brand,
      model,
      year,
      licensePlate,
      price,
      imageUrl,
      description,
      isAvailable,
    } = req.body;

    // Find car
    const car = await prisma.car.findUnique({
      where: { id },
    });

    if (!car) {
      return res.status(404).json({ message: "Car not found" });
    }

    // Check if user is the owner
    if (car.ownerId !== req.user.id) {
      return res
        .status(403)
        .json({ message: "You are not authorized to update this car" });
    }

    // If license plate changed, check if new one exists
    if (licensePlate && licensePlate !== car.licensePlate) {
      const existingCar = await prisma.car.findUnique({
        where: { licensePlate },
      });

      if (existingCar) {
        return res
          .status(400)
          .json({ message: "License plate already registered" });
      }
    }

    // Update car
    const updatedCar = await prisma.car.update({
      where: { id },
      data: {
        name,
        brand,
        model,
        year,
        licensePlate,
        price,
        imageUrl,
        description,
        isAvailable,
      },
    });

    res.status(200).json({
      message: "Car updated successfully",
      car: updatedCar,
    });
  } catch (error) {
    console.error("Update car error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete car
export const deleteCar = async (req, res) => {
  try {
    const { id } = req.params;

    // Find car
    const car = await prisma.car.findUnique({
      where: { id },
    });

    if (!car) {
      return res.status(404).json({ message: "Car not found" });
    }

    // Check if user is the owner
    if (car.ownerId !== req.user.id) {
      return res
        .status(403)
        .json({ message: "You are not authorized to delete this car" });
    }

    // Check if car has active orders
    const activeOrders = await prisma.order.findMany({
      where: {
        carId: id,
        status: {
          in: ["PENDING", "CONFIRMED", "ONGOING"],
        },
      },
    });

    if (activeOrders.length > 0) {
      return res
        .status(400)
        .json({ message: "Cannot delete car with active orders" });
    }

    // Delete car
    await prisma.car.delete({
      where: { id },
    });

    res.status(200).json({ message: "Car deleted successfully" });
  } catch (error) {
    console.error("Delete car error:", error);
    res.status(500).json({ message: "Server error" });
  }
};