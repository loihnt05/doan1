import { Entity, PrimaryGeneratedColumn, Column, BeforeInsert, PrimaryColumn } from 'typeorm';

@Entity()
export class User {
    @PrimaryColumn()
    id: number;

    @Column({ unique: true })
    username: string;

    @Column()
    password: string;

    @BeforeInsert()
    async hashPassword() {
        // hash password before insert to database
        // avoid storing plain text password in database 
        const bcrypt = await import('bcrypt');
        this.password = await bcrypt.hash(this.password, 10);
    }
}