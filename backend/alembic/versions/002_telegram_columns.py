"""Add Telegram notification columns to users table

Revision ID: 002
Revises: 001
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('telegram_chat_id', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('telegram_notify_live', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('users', sa.Column('telegram_notify_sim', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('users', sa.Column('telegram_link_code', sa.String(20), nullable=True))
    op.add_column('users', sa.Column('telegram_link_code_expires', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('users', 'telegram_link_code_expires')
    op.drop_column('users', 'telegram_link_code')
    op.drop_column('users', 'telegram_notify_sim')
    op.drop_column('users', 'telegram_notify_live')
    op.drop_column('users', 'telegram_chat_id')
