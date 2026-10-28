const { Sequelize } = require('sequelize');
const config = require('../config/database')[process.env.NODE_ENV || 'development'];

const AdminModel = require('./Admin');
const CustomerModel = require('./Customer');
const RefreshTokenModel = require('./RefreshToken');
const AddressModel = require('./Address');
const ProductModel = require('./Product');
const CategoryModel = require('./Category');
const ProductVariantModel = require('./ProductVariant');
const ProductImageModel = require('./ProductImage');
const PromoCodeModel = require('./PromoCode');
const OrderModel = require('./Order');
const OrderItemModel = require('./OrderItem');
const CartModel = require('./Cart');
const CartItemModel = require('./CartItem');
const WishlistModel = require('./Wishlist');
const ReviewModel = require('./Review');
const ReviewImageModel = require('./ReviewImage');
const ReturnModel = require('./Return');
const LoyaltyModel = require('./Loyalty');
const LoyaltyTransactionModel = require('./LoyaltyTransaction');
const NotificationModel = require('./Notification');
const ChatSessionModel = require('./ChatSession');
const ChatMessageModel = require('./ChatMessage');
const InventoryLogModel = require('./InventoryLog');
const BrandModel = require('./Brand');

const sequelize = config.url
  ? new Sequelize(config.url, config)
  : new Sequelize(config.database, config.username, config.password, config);

const models = {
  Admin: AdminModel(sequelize),
  Customer: CustomerModel(sequelize),
  RefreshToken: RefreshTokenModel(sequelize),
  Address: AddressModel(sequelize),
  Product: ProductModel(sequelize),
  Category: CategoryModel(sequelize),
  ProductVariant: ProductVariantModel(sequelize),
  ProductImage: ProductImageModel(sequelize),
  PromoCode: PromoCodeModel(sequelize),
  Order: OrderModel(sequelize),
  OrderItem: OrderItemModel(sequelize),
  Cart: CartModel(sequelize),
  CartItem: CartItemModel(sequelize),
  Wishlist: WishlistModel(sequelize),
  Review: ReviewModel(sequelize),
  ReviewImage: ReviewImageModel(sequelize),
  Return: ReturnModel(sequelize),
  Loyalty: LoyaltyModel(sequelize),
  LoyaltyTransaction: LoyaltyTransactionModel(sequelize),
  Notification: NotificationModel(sequelize),
  ChatSession: ChatSessionModel(sequelize),
  ChatMessage: ChatMessageModel(sequelize),
  InventoryLog: InventoryLogModel(sequelize),
  Brand: BrandModel(sequelize),
};

Object.values(models).forEach((model) => {
  if (model.associate) model.associate(models);
});

module.exports = { sequelize, Sequelize, ...models };
