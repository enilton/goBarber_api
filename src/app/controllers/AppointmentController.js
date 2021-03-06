import * as Yup from "yup";
import { startOfHour, parseISO, isBefore, format, subHours } from "date-fns";
import pt from "date-fns/locale/pt";
import Appointment from "../models/Appointment";
import User from "../models/User";
import File from "../models/File";
import Notification from "../schemas/Notification";
import Queue from "../../utils/Queue";
import CancellationMail from '../jobs/CancellationMail';


class AppointmentController {
  async store(req, res) {
    const schema = Yup.object().shape({
      provider_id: Yup.number().required(),
      date: Yup.date().required(),
    });

    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: "validation fails " });
    }

    const { provider_id, date } = req.body;

    const isProvider = await User.findOne({
      where: { id: provider_id, provider: true },
    });

    if (!isProvider) {
      return res.status(400).json({
        error: "Only providers has permissions to create an appointment ",
      });
    }

    /*
     *Gets only start momment of hour
     */
    const hourStart = startOfHour(parseISO(date));

    if (isBefore(hourStart, new Date())) {
      return res.status(400).json({ error: "Past error are not permited " });
    }

    const checkAvaliability = await Appointment.findOne({
      where: {
        provider_id,
        canceled_at: null,
        date: hourStart,
      },
    });

    if (checkAvaliability) {
      return res
        .status(400)
        .json({ error: "Appintment date is not avaliable " });
    }

    const appointment = await Appointment.create({
      user_id: req.user_id,
      provider_id,
      hourStart,
    });

    const user = await User.findByPk(req.userId);
    const formattedDate = format(
      hourStart,
      "'dia' dd 'de' MMMM', às' H:mm'h'",
      { locale: pt }
    );

    await Notification.create({
      content: `Novo agendamento de ${user.name} 
      para ${formattedDate}`,
      user: provider_id,
    });

    return res.json(appointment);
  }

  async index(req, res) {
    const { page = 1 } = req.query;

    const appointments = await Appointment.findAll({
      where: {
        user_id: req.user_id,
        canceled_at: null,
      },
      order: ["date"],
      attributes: ["id", "date"],
      limit: 20,
      offset: (page - 1) * 20,
      include: [
        {
          model: User,
          as: "provider",
          attributes: ["id", "name"],
          include: [
            {
              mode: File,
              as: "avatar",
              attributes: ["id", "path", "url"],
            },
          ],
        },
      ],
    });

    return res.json(appointments);
  }

  async delete(req,res){
    const appointment = await Appointment.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'provider',
          attributes: ['name','email']
        },
        {
          mode: User,
          as: user,
          attributes: ['name']
        }
      ]
    });
      
    if (appointment.user_id =! req.userId){
      return res.status(401).json({
       error: " Yout dont have permission to cancel this appointment ",
      });
    }

    const dateWithSub = subHours(appointment.date, 2);

    if (isBefore(dateWithSub, new Date())){
      return res.status(401).json({
        error: " You can only cancel appintmens 2 hours in advance ",
       });
    }

    appointment.canceled_at = new Date();

    await appointment.seve();

    await Queue.add(CancellationMail.key, {
      appointment
    });    

    return res.json(appointment);
  }
}

export default new AppointmentController();
